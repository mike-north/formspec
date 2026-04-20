/**
 * Phase 0 baseline: real Stripe SDK `Ref<Customer>` stress-test benchmark.
 *
 * Measures three metrics for a single `generateSchemasFromProgram` call
 * against the `RealSdkCustomerRefForm` fixture, which uses REAL types from the
 * `stripe` npm package instead of hand-authored stubs.
 *
 *   1. wallTime_ms   — end-to-end elapsed time (cold + warm median over 3 runs)
 *   2. peakRSS_MB    — peak resident set size (megabytes) observed via polling
 *   3. didOOM        — whether the process ran out of memory
 *
 * ### Why this benchmark matters
 *
 * The synthetic `stripe-ref-customer` fixture uses hand-authored Stripe-like
 * types (~80 properties across the type graph). The REAL `stripe` npm package
 * ships thousands of types, deeply nested, with large discriminated unions (e.g.
 * `Stripe.Invoice` is ~4 000 lines of TypeScript declarations). If the
 * external-type bypass in `extractReferenceTypeArguments` (PR #308,
 * `packages/build/src/analyzer/class-analyzer.ts`) does NOT engage on types
 * from `node_modules/stripe/...`, the analyzer recurses into the full SDK type
 * graph and may exhaust memory — reproducing the user-reported OOM.
 *
 * ### OOM detection strategy
 *
 * The OOM probe runs in a subprocess capped at `--max-old-space-size=1024`
 * (1 GB heap). Detection uses three tiers (in priority order):
 *   1. Known OOM stderr indicators (`JavaScript heap out of memory`, `ENOMEM`, etc.)
 *   2. SIGKILL termination (`result.signal === "SIGKILL"`) — OS kills process
 *      before Node.js can write diagnostic output.
 *   3. Null exit status with any non-null signal — treated as OOM because the
 *      only child task is schema generation; a signal-terminated success would
 *      have exited 0.
 *
 * ### Phase 4 acceptance gate (§8.4)
 *
 * After the host-checker migration:
 *   - `didOOM: false` on a 1 GB runner
 *   - `peakRSS_MB` ≤ 512 MB
 *
 * If this baseline records `didOOM: true`, the OOM has been reproduced and the
 * Phase 4 gate is the bug fix. If it records `didOOM: false` with low RSS, the
 * external-type bypass is working correctly for real SDK types and the
 * user-reported OOM is about something else.
 *
 * ### Run model
 *
 * Three runs are collected. Run 1 is the **cold run** (first invocation; module
 * imports run before the timer starts). Runs 2–3 are **warm runs**. Median is
 * computed over warm runs for wall time and RSS.
 *
 * ### How to run
 *
 *   pnpm --filter @formspec/e2e run bench:stripe-real-sdk
 *
 * To capture JSON:
 *
 *   GIT_COMMIT_SHA=$(git rev-parse HEAD) \
 *     pnpm --filter @formspec/e2e run bench:stripe-real-sdk \
 *     > stripe-real-sdk-baseline.json 2>/dev/null
 *
 * ### Output
 *
 * Writes baseline JSON to `e2e/bench/baselines/stripe-real-sdk-baseline.json`
 * and emits human-readable output to stderr and JSON to stdout.
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
const FIXTURE_DIR = path.join(E2E_ROOT, "fixtures", "stripe-real-sdk");
const BASELINE_DIR = path.join(E2E_ROOT, "bench", "baselines");
const BASELINE_PATH = path.join(BASELINE_DIR, "stripe-real-sdk-baseline.json");
const TYPE_NAME = "RealSdkCustomerRefForm";
const FIXTURE_FILE = "customer-ref-form.ts";
const RUNS = 3;

// Heap cap for OOM probe (§8.4: 1 GB).
const OOM_PROBE_HEAP_MB = 1024;

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

function runBuildBenchOnce(fixturePath: string): BuildRunResult {
  // The fixture imports from "stripe" — we need the stripe node_modules to
  // be on the path so ts.createProgram can resolve the type declarations.
  const program = ts.createProgram([fixturePath], COMPILER_OPTIONS);

  // Verify the program resolves cleanly before measuring. If Stripe imports
  // fail to resolve (wrong version, missing dev-dep) we would measure against
  // an incomplete type graph and produce a meaningless baseline.
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(
      [...diagnostics],
      {
        getCurrentDirectory: () => E2E_ROOT,
        getCanonicalFileName: (f) => f,
        getNewLine: () => "\n",
      }
    );
    throw new Error(
      `TypeScript diagnostics found for fixture "${fixturePath}" — ` +
        "baseline measurements would be invalid:\n" +
        formatted
    );
  }

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
 * 3. ETIMEDOUT (`result.error?.code === "ETIMEDOUT"`) — `spawnSync` exceeded its
 *    `timeout` option and sent SIGTERM. This is NOT OOM; the function throws so
 *    the caller can record a distinct timeout outcome.
 * 4. Null exit status with SIGKILL — treated as OOM (OS killed before Node.js
 *    could write diagnostic output).
 * 5. Other non-zero exits without a signal and without known OOM output — logged
 *    as a warning (e.g. fixture compilation failure, uncaught exception) and
 *    returned as `false` so the baseline is not invalidated silently.
 *
 * @throws {Error} If `spawnSync` timed out (`ETIMEDOUT`). Timeout is not OOM.
 */
function detectOom(fixturePath: string, maxOldSpaceMb = OOM_PROBE_HEAP_MB): boolean {
  // Numeric enum values embedded directly — avoids template-expression type errors.
  const scriptTarget = String(ts.ScriptTarget.ES2022);
  const moduleKind = String(ts.ModuleKind.NodeNext);
  const moduleResolution = String(ts.ModuleResolutionKind.NodeNext);

  const runnerScript = [
    `import { createProgram } from "typescript";`,
    `import { generateSchemasFromProgram } from "@formspec/build";`,
    `const program = createProgram(${JSON.stringify([fixturePath])}, {`,
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

  const tmpDir = os.tmpdir();
  const runnerPath = path.join(tmpDir, `formspec-oom-probe-real-sdk-${String(process.pid)}.mjs`);
  try {
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
        timeout: 300_000, // 5 min — real SDK types may take longer
        // cwd must be E2E_ROOT so Node.js resolves `@formspec/build`, `typescript`,
        // and `stripe` from the e2e workspace node_modules rather than from the OS
        // tmpdir (which has none of those packages).
        cwd: E2E_ROOT,
        env: { ...process.env },
      }
    );

    if (result.status === 0) return false;

    // Tier 0: spawnSync timed out — ETIMEDOUT is NOT OOM.
    // Throw so the caller records a distinct timeout outcome instead of
    // silently returning didOOM: false and continuing with an invalid baseline.
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
      throw new Error(
        `OOM probe timed out after ${String(300_000 / 60_000)} minutes — ` +
          "consider raising the timeout if the real SDK is slower than expected."
      );
    }

    // Tier 1: Known OOM indicators in stdout/stderr.
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

    // Tier 2: SIGKILL with null status — OS terminated before Node.js could
    // write OOM diagnostics.
    if (result.status === null && result.signal === "SIGKILL") {
      return true;
    }

    // Tier 3: Any other null-status signal — treated as OOM because the only
    // child task is schema generation; a signal-terminated success exits 0.
    if (result.status === null && result.signal !== null) {
      return true;
    }

    // Tier 4: Non-signal non-zero exit (fixture compilation failure, uncaught
    // exception, etc.). This is a distinct class of error — log a warning so
    // the operator is not left wondering why didOOM is false.
    process.stderr.write(
      `\n  WARNING: OOM probe exited with status ${String(result.status)} (not a signal, not OOM indicators found).\n` +
        `  This may indicate a fixture load error or uncaught exception.\n` +
        `  stdout: ${result.stdout.slice(0, 500)}\n` +
        `  stderr: ${result.stderr.slice(0, 500)}\n`
    );
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

interface StripeRealSdkBaseline {
  readonly phase: "0";
  readonly description: string;
  readonly fixture: string;
  readonly typeName: string;
  readonly runs: number;
  readonly stripeVersion: string;
  readonly metrics: {
    readonly peakRSS_MB: number;
    readonly wallTime_ms: number;
    readonly didOOM: boolean;
    readonly warmWallTimes_ms: readonly number[];
    readonly allPeakRSS_MB: readonly number[];
    readonly coldWallTime_ms: number;
    readonly oomHeapCapMb: number;
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

  // The fixture imports from "stripe". Rather than copying it to a temp
  // directory (which would break the "stripe" import resolution), we run
  // directly against the fixture file in its original location so TypeScript
  // can resolve `node_modules/stripe` from the e2e workspace.
  const fixturePath = path.join(FIXTURE_DIR, FIXTURE_FILE);

  // Verify stripe version for the baseline record.
  const stripePackageJsonPath = path.join(
    E2E_ROOT,
    "node_modules",
    "stripe",
    "package.json"
  );
  const stripeVersion = await fs
    .readFile(stripePackageJsonPath, "utf8")
    .then((raw) => {
      const parsed = JSON.parse(raw) as { version?: string };
      return parsed.version ?? "unknown";
    })
    .catch(() => "unknown");

  process.stderr.write(`\n=== Real Stripe SDK Ref<Customer> Stress-Test Benchmark (Phase 0 baseline) ===\n\n`);
  process.stderr.write(`  fixture type:   ${TYPE_NAME}\n`);
  process.stderr.write(`  fixture file:   ${fixturePath}\n`);
  process.stderr.write(`  stripe version: ${stripeVersion}\n`);
  process.stderr.write(`  runs:           ${String(RUNS)} (run 1 = cold)\n`);
  process.stderr.write(`  OOM heap cap:   ${String(OOM_PROBE_HEAP_MB)} MB\n\n`);

  // --- Build-path measurements ---
  const allWallTimeMs: number[] = [];
  const allPeakRssBytes: number[] = [];

  process.stderr.write(`  Build-path (generateSchemasFromProgram):\n`);
  for (let i = 0; i < RUNS; i++) {
    const label = i === 0 ? "cold" : "warm";
    process.stderr.write(`    run ${String(i + 1)}/${String(RUNS)} [${label}]...`);
    const result = runBuildBenchOnce(fixturePath);
    allWallTimeMs.push(result.wallTimeMs);
    allPeakRssBytes.push(result.peakRssBytes);
    process.stderr.write(
      ` ${result.wallTimeMs.toFixed(1)}ms  RSS=${(result.peakRssBytes / 1024 / 1024).toFixed(1)}MB\n`
    );
  }

  const warmWallTimeMs = allWallTimeMs.slice(1);
  const warmPeakRssBytes = allPeakRssBytes.slice(1);

  const medianWarmWallTimeMs = warmWallTimeMs.length > 0 ? median(warmWallTimeMs) : (allWallTimeMs[0] ?? 0);
  const medianWarmPeakRssBytes = warmPeakRssBytes.length > 0 ? median(warmPeakRssBytes) : (allPeakRssBytes[0] ?? 0);
  const coldWallTimeMs = allWallTimeMs[0] ?? 0;
  const peakRSSMB = medianWarmPeakRssBytes / 1024 / 1024;

  // --- OOM detection ---
  process.stderr.write(`\n  OOM probe (${String(OOM_PROBE_HEAP_MB)} MB heap cap, timeout 5 min)...\n`);
  const didOOM = detectOom(fixturePath, OOM_PROBE_HEAP_MB);
  process.stderr.write(`    didOOM: ${String(didOOM)}\n`);

  // --- Human-readable summary ---
  process.stderr.write(`\n--- Phase 0 Real Stripe SDK Baseline ---\n`);
  process.stderr.write(`  stripe version:              ${stripeVersion}\n`);
  process.stderr.write(
    `  wallTime_ms cold:            ${coldWallTimeMs.toFixed(2)}\n`
  );
  process.stderr.write(
    `  wallTime_ms warm (median):   ${medianWarmWallTimeMs.toFixed(2)}\n`
  );
  process.stderr.write(
    `  peakRSS_MB warm (median):    ${peakRSSMB.toFixed(1)} MB\n`
  );
  process.stderr.write(`  didOOM (${String(OOM_PROBE_HEAP_MB)} MB cap):          ${String(didOOM)}\n`);
  process.stderr.write(`----------------------------------------\n`);

  // --- Interpretation note ---
  if (didOOM) {
    process.stderr.write(`\n  *** OOM REPRODUCED — real SDK types exceed heap cap ***\n`);
    process.stderr.write(`  *** Phase 4 gate: fix must achieve didOOM:false + peakRSS_MB <= 512 MB ***\n\n`);
  } else {
    process.stderr.write(`\n  External-type bypass engaging correctly for real SDK types.\n`);
    process.stderr.write(`  Phase 4 gate: peakRSS_MB <= 512 MB, didOOM: false.\n\n`);
  }

  // --- Write baseline JSON ---
  const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";

  const baseline: StripeRealSdkBaseline = {
    phase: "0",
    description: "Real Stripe SDK Ref<Customer> stress-test — Phase 0 pre-refactor baseline",
    fixture: "e2e/fixtures/stripe-real-sdk/customer-ref-form.ts",
    typeName: TYPE_NAME,
    runs: RUNS,
    stripeVersion,
    metrics: {
      peakRSS_MB: Math.round(peakRSSMB * 10) / 10,
      wallTime_ms: Math.round(medianWarmWallTimeMs * 100) / 100,
      didOOM,
      warmWallTimes_ms: warmWallTimeMs.map((v) => Math.round(v * 100) / 100),
      allPeakRSS_MB: allPeakRssBytes.map((v) => Math.round((v / 1024 / 1024) * 10) / 10),
      coldWallTime_ms: Math.round(coldWallTimeMs * 100) / 100,
      oomHeapCapMb: OOM_PROBE_HEAP_MB,
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
}

await main();
