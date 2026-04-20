/**
 * Phase 0 baseline: Stripe realistic OOM sweep — build surface.
 *
 * Measures `generateSchemasFromProgram` (from `@formspec/build/internals`)
 * against a fixture that embeds Stripe types DIRECTLY — no Ref<T> wrapper.
 * This is the code path reported to OOM in real user projects.
 *
 * Unlike `e2e/fixtures/stripe-ref-customer/` (which uses a Ref<T> wrapper
 * to engage the external-type bypass in PR #308), this fixture forces the
 * analyzer to walk real Stripe.Customer / Stripe.Invoice / etc.
 *
 * ### Metrics captured
 *
 *   1. wallTimeMs   — end-to-end elapsed time (cold + warm median over 3 runs)
 *   2. peakRSS_MB   — peak resident set size (polling, warm median)
 *   3. didOOM       — whether the process OOMs at a 1 GB heap cap
 *
 * ### OOM detection
 *
 * The OOM probe spawns a subprocess with `--max-old-space-size=1024`.
 * Detection checks (in priority order):
 *   1. Known OOM stderr indicators
 *   2. SIGKILL termination (OS kills before Node.js writes diagnostics)
 *   3. Null exit status with any signal
 *
 * ### Phase 4 gate
 *
 * After host-checker migration: peakRSS_MB ≤ 50% of this baseline,
 * zero OOM at 1 GB cap across all four surfaces.
 *
 * ### How to run
 *
 *   pnpm --filter @formspec/e2e run bench:stripe-realistic-build
 *
 * Surface label: "build"
 * Baseline: e2e/bench/baselines/stripe-realistic-build-baseline.json
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
const FIXTURE_DIR = path.join(E2E_ROOT, "fixtures", "stripe-realistic-oom");
const BASELINE_DIR = path.join(E2E_ROOT, "bench", "baselines");
const BASELINE_PATH = path.join(BASELINE_DIR, "stripe-realistic-build-baseline.json");
const FIXTURE_FILE = "checkout-form.ts";
const TYPE_NAME = "CheckoutForm";
const RUNS = 3;
const OOM_HEAP_CAP_MB = 1024;

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
  const program = ts.createProgram([fixturePath], COMPILER_OPTIONS);

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
 * `maxOldSpaceMb` MB. Returns `true` if the process ran out of memory.
 */
function detectOom(fixturePath: string, maxOldSpaceMb: number): boolean {
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
  const runnerPath = path.join(tmpDir, `formspec-oom-probe-build-${String(process.pid)}.mjs`);

  try {
    fsSync.writeFileSync(runnerPath, runnerScript, "utf8");
  } catch {
    return false;
  }

  try {
    const result = spawnSync(
      process.execPath,
      [`--max-old-space-size=${String(maxOldSpaceMb)}`, runnerPath],
      {
        encoding: "utf8",
        timeout: 300_000,
        env: { ...process.env },
      }
    );

    if (result.status === 0) return false;

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

    if (result.status === null && result.signal !== null) {
      return true;
    }

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

interface StripeRealisticBuildBaseline {
  readonly phase: "0";
  readonly surface: "build";
  readonly description: string;
  readonly fixture: string;
  readonly typeName: string;
  readonly runs: number;
  readonly oomHeapCapMB: number;
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
  await fs.mkdir(BASELINE_DIR, { recursive: true });

  // Copy the fixture file to a temp directory so ts.createProgram can
  // resolve it as a real file from the filesystem and can resolve the
  // stripe package from the e2e node_modules.
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "formspec-stripe-realistic-build-")
  );

  try {
    const fixtureSrc = await fs.readFile(path.join(FIXTURE_DIR, FIXTURE_FILE), "utf8");
    const fixturePath = path.join(workspaceRoot, FIXTURE_FILE);
    await fs.writeFile(fixturePath, fixtureSrc, "utf8");

    // Write a tsconfig so the TypeScript compiler can resolve stripe types
    // from the e2e package's node_modules.
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        baseUrl: workspaceRoot,
        paths: {},
      },
    };
    await fs.writeFile(
      path.join(workspaceRoot, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2),
      "utf8"
    );

    // Copy the e2e node_modules stripe types into the temp workspace via symlink
    // so ts.createProgram can find them.
    const e2eNodeModules = path.join(E2E_ROOT, "node_modules");
    const tmpNodeModules = path.join(workspaceRoot, "node_modules");
    await fs.symlink(e2eNodeModules, tmpNodeModules, "dir");

    process.stderr.write(`\n=== Stripe Realistic OOM Sweep — Build Surface (Phase 0 baseline) ===\n\n`);
    process.stderr.write(`  fixture type: ${TYPE_NAME}\n`);
    process.stderr.write(`  fixture file: ${FIXTURE_FILE}\n`);
    process.stderr.write(`  runs:         ${String(RUNS)} (run 1 = cold)\n`);
    process.stderr.write(`  OOM cap:      ${String(OOM_HEAP_CAP_MB)} MB\n\n`);

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

    process.stderr.write(`\n  OOM probe (${String(OOM_HEAP_CAP_MB)} MB cap)...\n`);
    const didOOM = detectOom(fixturePath, OOM_HEAP_CAP_MB);
    process.stderr.write(`    didOOM: ${String(didOOM)}\n`);

    process.stderr.write(`\n--- Phase 0 Stripe Realistic Build Baseline ---\n`);
    process.stderr.write(`  surface:                     build\n`);
    process.stderr.write(`  wallTime_ms cold:             ${coldWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  wallTime_ms warm (median):    ${medianWarmWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  peakRSS_MB warm (median):    ${peakRSSMB.toFixed(1)} MB\n`);
    process.stderr.write(`  didOOM (${String(OOM_HEAP_CAP_MB)} MB cap):       ${String(didOOM)}\n`);
    process.stderr.write(`----------------------------------------------\n`);
    process.stderr.write(`\n  Phase 4 gate: peakRSS_MB ≤ ${(peakRSSMB * 0.5).toFixed(1)} MB, zero OOM at 1 GB cap\n\n`);

    const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";

    const baseline: StripeRealisticBuildBaseline = {
      phase: "0",
      surface: "build",
      description:
        "Stripe realistic OOM sweep — build surface (generateSchemasFromProgram, direct Stripe types, no Ref<T> wrapper)",
      fixture: "e2e/fixtures/stripe-realistic-oom/checkout-form.ts",
      typeName: TYPE_NAME,
      runs: RUNS,
      oomHeapCapMB: OOM_HEAP_CAP_MB,
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

    process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

await main();
