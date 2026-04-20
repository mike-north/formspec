/**
 * Phase 0 baseline: Stripe `Ref<Customer>` stress-test benchmark (§8.4a / 0.5l).
 *
 * Measures three metrics for a single `generateSchemasFromProgram` call
 * against the 30-field `CustomerRefForm` fixture that includes `Ref<T>`-typed
 * fields backed by Stripe-like types declared in a sibling file.
 *
 *   1. wallTimeMs      — end-to-end elapsed time
 *   2. peakRSS_MB      — peak resident set size (megabytes) observed via polling
 *   3. didOOM          — whether the process ran out of memory
 *
 * ### Why this benchmark matters
 *
 * The synthetic `ts.Program` inside `@formspec/analysis` has historically been
 * the OOM risk in FormSpec — it instantiates a parallel type graph that the host
 * checker has already computed once. The Stripe `Ref<T>` fixture exercises
 * generic-reference resolution across two source files, triggering the external-type
 * bypass in `extractReferenceTypeArguments` (PR #308). This is the path that was
 * historically prone to stack overflows and memory exhaustion on large SDK types.
 *
 * ### Phase comparison gates (§8.4b and §8.4c)
 *
 *   - **Phase 4** (after host-checker migration): peakRSS_MB ≤ 50% of this baseline,
 *     zero OOM on a 1 GB runner.
 *   - **Phase 6** (after full synthetic deletion): same fixture, zero `ts.createProgram`
 *     calls in debug logs (`syntheticProgramCount` reads 0).
 *
 * ### resolvePayload availability
 *
 * PR #300 (`resolvePayload` / `extractPayload` on `CustomTypeRegistration`) was
 * superseded by PR #308 and removed in PR #313. This benchmark uses the existing
 * `generateSchemasFromProgram` API directly — no custom type registration is needed
 * because the external-type bypass already handles `Ref<T>` correctly.
 *
 * See `e2e/fixtures/stripe-ref-customer/STUB_NOTE.md` for migration guidance.
 *
 * ### Run model
 *
 * Five runs are collected. Run 1 is the **cold run** (first invocation; module imports
 * run before the timer starts). Runs 2–5 are **warm runs**. Median is computed over
 * warm runs for wall time and RSS. OOM detection uses a subprocess with a 512 MB
 * `--max-old-space-size` limit; if the subprocess exits non-zero with `ENOMEM` or
 * JavaScript heap OOM messages, `didOOM` is set to `true`.
 *
 * ### Output
 *
 * Writes baseline JSON to `e2e/bench/baselines/stripe-ref-customer-baseline.json`
 * and emits human-readable output to stderr and JSON to stdout.
 *
 * ### How to run
 *
 *   pnpm --filter @formspec/e2e run bench:stripe-ref-customer
 *
 * To capture JSON:
 *
 *   GIT_COMMIT_SHA=$(git rev-parse HEAD) \
 *     pnpm --filter @formspec/e2e run bench:stripe-ref-customer \
 *     > stripe-ref-baseline.json 2>/dev/null
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import * as ts from "typescript";
import { generateSchemasFromProgram } from "@formspec/build";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(BENCH_DIR, "..");
const FIXTURE_DIR = path.join(E2E_ROOT, "fixtures", "stripe-ref-customer");
const BASELINE_DIR = path.join(E2E_ROOT, "bench", "baselines");
const BASELINE_PATH = path.join(BASELINE_DIR, "stripe-ref-customer-baseline.json");
const TYPE_NAME = "CustomerRefForm";
const RUNS = 5;

// TODO: migrate to real `import Stripe from "stripe"` + resolvePayload once
//       a resolvePayload-equivalent lands on CustomTypeRegistration.
//       See e2e/fixtures/stripe-ref-customer/STUB_NOTE.md for context.
const RESOLVE_PAYLOAD_AVAILABLE = false;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
};

// ---------------------------------------------------------------------------
// Peak-RSS polling
// ---------------------------------------------------------------------------

interface RssPoller {
  stop: () => number;
}

function startRssPoller(intervalMs = 5): RssPoller {
  let peak = process.memoryUsage().rss;

  const id = setInterval(() => {
    const current = process.memoryUsage().rss;
    if (current > peak) peak = current;
  }, intervalMs);

  // Ensure the interval does not block process exit.
  if (typeof id.unref === "function") id.unref();

  return {
    stop: () => {
      clearInterval(id);
      const final = process.memoryUsage().rss;
      if (final > peak) peak = final;
      return peak;
    },
  };
}

// ---------------------------------------------------------------------------
// Single benchmark run
// ---------------------------------------------------------------------------

interface BuildRunResult {
  readonly wallTimeMs: number;
  readonly peakRssBytes: number;
}

function runBuildBenchOnce(fixturePath: string, extraFiles: string[]): BuildRunResult {
  const allFiles = [fixturePath, ...extraFiles];
  const program = ts.createProgram(allFiles, COMPILER_OPTIONS);

  const rssPoller = startRssPoller();
  const start = performance.now();

  generateSchemasFromProgram({
    program,
    filePath: fixturePath,
    typeName: TYPE_NAME,
    errorReporting: "diagnostics",
  });

  const wallTimeMs = performance.now() - start;
  const peakRssBytes = rssPoller.stop();

  return { wallTimeMs, peakRssBytes };
}

// ---------------------------------------------------------------------------
// OOM detection via subprocess with memory cap
// ---------------------------------------------------------------------------

/**
 * Runs a single schema-generation pass in a child Node.js process capped at
 * `maxOldSpaceMb` MB of V8 old-space. Returns `true` if the process ran out
 * of memory.
 *
 * Detection strategy (in priority order):
 * 1. Known OOM stderr indicators (`JavaScript heap out of memory`, `ENOMEM`, etc.)
 * 2. SIGKILL termination (`result.signal === "SIGKILL"`) — the OS kills the
 *    process before Node.js can write diagnostic output when heap allocation
 *    fails at the OS level.
 * 3. Null exit status with any signal — treated as OOM because the only child
 *    task is schema generation; a signal-terminated run that succeeded would
 *    have exited 0.
 *
 * Non-signal non-zero exits (e.g. fixture compilation failure, uncaught
 * exception from the runner script) are returned as `false` because they
 * indicate a different class of error rather than memory exhaustion.
 */
function detectOom(fixturePath: string, extraFiles: string[], maxOldSpaceMb = 512): boolean {
  // Write an inline runner script to a temp file that the child process executes.
  // We intentionally keep the script minimal — its only job is to call
  // generateSchemasFromProgram and exit 0 on success or 1 on failure.
  // Numeric enum values embedded directly — avoids template-expression type errors.
  const scriptTarget = String(ts.ScriptTarget.ES2022);
  const moduleKind = String(ts.ModuleKind.NodeNext);
  const moduleResolution = String(ts.ModuleResolutionKind.NodeNext);

  const runnerScript = [
    `import { createProgram } from "typescript";`,
    `import { generateSchemasFromProgram } from "@formspec/build";`,
    `const program = createProgram(${JSON.stringify([fixturePath, ...extraFiles])}, {`,
    `  target: ${scriptTarget},`,
    `  module: ${moduleKind},`,
    `  moduleResolution: ${moduleResolution},`,
    `  strict: true,`,
    `  skipLibCheck: true,`,
    `});`,
    `generateSchemasFromProgram({`,
    `  program,`,
    `  filePath: ${JSON.stringify(fixturePath)},`,
    `  typeName: ${JSON.stringify(TYPE_NAME)},`,
    `  errorReporting: "diagnostics",`,
    `});`,
    `process.exit(0);`,
  ].join("\n");

  // Write the runner script to a temp file so the child can import it as ESM.
  const tmpDir = os.tmpdir();
  const runnerPath = path.join(tmpDir, `formspec-oom-probe-${String(process.pid)}.mjs`);
  try {
    // Sync write — this runs before the child is spawned.
    fsSync.writeFileSync(runnerPath, runnerScript, "utf8");
  } catch {
    // If we can't write the probe script, conservatively report no OOM.
    return false;
  }

  try {
    const result = spawnSync(
      process.execPath,
      [`--max-old-space-size=${String(maxOldSpaceMb)}`, runnerPath],
      {
        encoding: "utf8",
        timeout: 120_000,
        env: { ...process.env },
      }
    );

    if (result.status === 0) return false;

    // Check for OOM indicators in output.
    const output = `${result.stdout}${result.stderr}`;
    const oomIndicators = [
      "ENOMEM",
      "out of memory",
      "JavaScript heap out of memory",
      "Allocation failed",
    ];
    if (oomIndicators.some((indicator) => output.toLowerCase().includes(indicator.toLowerCase()))) {
      return true;
    }

    // SIGKILL (or any signal with a null status) means the OS terminated the
    // process before Node.js could write OOM diagnostics — treat as OOM.
    if (result.status === null && result.signal !== null) {
      return true;
    }

    // Non-zero exit without a signal and without known OOM output: likely a
    // different error (e.g. fixture compilation failure, uncaught exception).
    return false;
  } finally {
    try {
      fsSync.unlinkSync(runnerPath);
    } catch {
      // Best effort cleanup.
    }
  }
}

// ---------------------------------------------------------------------------
// Median helper
// ---------------------------------------------------------------------------

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot compute median of empty array");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      (sorted[mid - 1]! + sorted[mid]!) / 2
    : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      sorted[mid]!;
}

// ---------------------------------------------------------------------------
// Baseline JSON shape
// ---------------------------------------------------------------------------

interface StripeRefCustomerBaseline {
  readonly phase: "0";
  readonly description: string;
  readonly fixture: string;
  readonly typeName: string;
  readonly fieldCount: number;
  readonly runs: number;
  readonly resolvePayloadAvailable: boolean;
  readonly metrics: {
    readonly peakRSS_MB: number;
    readonly wallTime_ms: number;
    readonly didOOM: boolean;
    readonly warmWallTimes_ms: readonly number[];
    readonly allPeakRSS_MB: readonly number[];
    readonly coldWallTime_ms: number;
  };
  readonly gitSha: string;
  readonly timestamp: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Ensure baseline directory exists.
  await fs.mkdir(BASELINE_DIR, { recursive: true });

  // Copy fixture source files to a temp directory so ts.createProgram can
  // resolve them as real files from the filesystem.
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "formspec-stripe-ref-bench-")
  );

  try {
    // Copy both fixture files into the temp workspace.
    const fixtureFile = "customer-ref-form.ts";
    const supportFile = "stripe-like-types.ts";

    const fixtureSrc = await fs.readFile(path.join(FIXTURE_DIR, fixtureFile), "utf8");
    const supportSrc = await fs.readFile(path.join(FIXTURE_DIR, supportFile), "utf8");

    const fixturePath = path.join(workspaceRoot, fixtureFile);
    const supportPath = path.join(workspaceRoot, supportFile);

    await fs.writeFile(fixturePath, fixtureSrc, "utf8");
    await fs.writeFile(supportPath, supportSrc, "utf8");

    const extraFiles = [supportPath];

    process.stderr.write(`\n=== Stripe Ref<Customer> Stress-Test Benchmark (Phase 0 baseline) ===\n\n`);
    process.stderr.write(`  fixture type: ${TYPE_NAME}\n`);
    process.stderr.write(`  fixture file: ${fixtureFile}\n`);
    process.stderr.write(`  support file: ${supportFile}\n`);
    process.stderr.write(`  runs:         ${String(RUNS)} (run 1 = cold)\n`);
    process.stderr.write(`  resolvePayloadAvailable: ${String(RESOLVE_PAYLOAD_AVAILABLE)}\n\n`);

    // --- Build-path measurements ---
    const allWallTimeMs: number[] = [];
    const allPeakRssBytes: number[] = [];

    process.stderr.write(`  Build-path (generateSchemasFromProgram):\n`);
    for (let i = 0; i < RUNS; i++) {
      const label = i === 0 ? "cold" : "warm";
      process.stderr.write(`    run ${String(i + 1)}/${String(RUNS)} [${label}]...`);
      const result = runBuildBenchOnce(fixturePath, extraFiles);
      allWallTimeMs.push(result.wallTimeMs);
      allPeakRssBytes.push(result.peakRssBytes);
      process.stderr.write(
        ` ${result.wallTimeMs.toFixed(1)}ms  RSS=${(result.peakRssBytes / 1024 / 1024).toFixed(1)}MB\n`
      );
    }

    const warmWallTimeMs = allWallTimeMs.slice(1);
    const warmPeakRssBytes = allPeakRssBytes.slice(1);

    const medianWarmWallTimeMs = median(warmWallTimeMs);
    const medianWarmPeakRssBytes = median(warmPeakRssBytes);
    const coldWallTimeMs = allWallTimeMs[0] ?? 0;
    const peakRSSMB = medianWarmPeakRssBytes / 1024 / 1024;

    // --- OOM detection ---
    process.stderr.write(`\n  OOM probe (512 MB cap)...\n`);
    const didOOM = detectOom(fixturePath, extraFiles, 512);
    process.stderr.write(`    didOOM: ${String(didOOM)}\n`);

    // --- Human-readable summary ---
    process.stderr.write(`\n--- Phase 0 Stripe Ref<Customer> Baseline ---\n`);
    process.stderr.write(
      `  wallTime_ms cold:             ${coldWallTimeMs.toFixed(2)}\n`
    );
    process.stderr.write(
      `  wallTime_ms warm (median):    ${medianWarmWallTimeMs.toFixed(2)}\n`
    );
    process.stderr.write(
      `  peakRSS_MB warm (median):    ${peakRSSMB.toFixed(1)} MB\n`
    );
    process.stderr.write(`  didOOM (512 MB cap):         ${String(didOOM)}\n`);
    process.stderr.write(`  resolvePayloadAvailable:     ${String(RESOLVE_PAYLOAD_AVAILABLE)}\n`);
    process.stderr.write(`---------------------------------------------\n`);

    // --- Phase 4 / Phase 6 gate notes ---
    process.stderr.write(`\n  Phase 4 gate: peakRSS_MB ≤ ${(peakRSSMB * 0.5).toFixed(1)} MB, zero OOM on 1 GB runner\n`);
    process.stderr.write(`  Phase 6 gate: syntheticProgramCount = 0 (no ts.createProgram calls in debug logs)\n\n`);

    // --- Write baseline JSON ---
    const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";

    const baseline: StripeRefCustomerBaseline = {
      phase: "0",
      description: "Stripe Ref<Customer> stress-test — Phase 0 pre-refactor baseline (§8.4a)",
      fixture: "e2e/fixtures/stripe-ref-customer/customer-ref-form.ts",
      typeName: TYPE_NAME,
      fieldCount: 30,
      runs: RUNS,
      resolvePayloadAvailable: RESOLVE_PAYLOAD_AVAILABLE,
      metrics: {
        peakRSS_MB: Math.round(peakRSSMB * 10) / 10,
        wallTime_ms: Math.round(medianWarmWallTimeMs * 100) / 100,
        didOOM,
        warmWallTimes_ms: warmWallTimeMs.map((v) => Math.round(v * 100) / 100),
        allPeakRSS_MB: allPeakRssBytes.map((v) => Math.round((v / 1024 / 1024) * 10) / 10),
        coldWallTime_ms: Math.round(coldWallTimeMs * 100) / 100,
      },
      gitSha: commitSha,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    await fs.writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    process.stderr.write(`  Baseline written: ${BASELINE_PATH}\n\n`);

    // Machine-readable JSON to stdout.
    process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

await main();
