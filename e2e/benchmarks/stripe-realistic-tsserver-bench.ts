/**
 * Phase 0 baseline: Stripe realistic OOM sweep — tsserver-plugin surface.
 *
 * Instantiates `FormSpecSemanticService` (from `@formspec/ts-plugin`) against
 * a TypeScript program that includes the fixture file with direct Stripe types.
 * Simulates an editor open-file event by calling the service's diagnostic
 * handler once cold and twice warm (mimicking keystroke re-analysis).
 *
 * Unlike `e2e/fixtures/stripe-ref-customer/` (which uses a Ref<T> wrapper
 * to engage the external-type bypass in PR #308), this fixture forces the
 * semantic service to walk real Stripe.Customer / Stripe.Invoice / etc.
 *
 * This surface does NOT spawn actual tsserver — the FormSpecSemanticService
 * is instantiated directly, which exercises the same composable semantic
 * service code path that tsserver loads. This avoids tsserver noise while
 * still exercising the real plugin code path.
 *
 * ### Metrics captured
 *
 *   1. wallTimeMs   — end-to-end elapsed time (cold + warm median over 3 runs)
 *   2. peakRSS_MB   — peak resident set size (polling, warm median)
 *   3. didOOM       — whether the process OOMs at a 1 GB heap cap
 *   4. syntheticCompileCount — ts.createProgram invocations per run
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
 *   pnpm --filter @formspec/e2e run bench:stripe-realistic-tsserver
 *
 * Surface label: "tsserver-plugin"
 * Baseline: e2e/bench/baselines/stripe-realistic-tsserver-baseline.json
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import * as ts from "typescript";
import { FormSpecSemanticService } from "@formspec/ts-plugin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(BENCH_DIR, "..");
const FIXTURE_DIR = path.join(E2E_ROOT, "fixtures", "stripe-realistic-oom");
const BASELINE_DIR = path.join(E2E_ROOT, "bench", "baselines");
const BASELINE_PATH = path.join(BASELINE_DIR, "stripe-realistic-tsserver-baseline.json");
const FIXTURE_FILE = "checkout-form.ts";
// 1 cold + 2 warm to mimic: open file (cold), first keystroke (warm), second keystroke (warm)
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
// Single benchmark run (tsserver-plugin path)
// ---------------------------------------------------------------------------

interface TsserverRunResult {
  readonly wallTimeMs: number;
  readonly peakRssBytes: number;
  readonly syntheticCompileCount: number;
  readonly diagnosticsCount: number;
}

function runTsserverBenchOnce(
  workspaceRoot: string,
  fixturePath: string
): TsserverRunResult {
  const program = ts.createProgram([fixturePath], COMPILER_OPTIONS);

  const service = new FormSpecSemanticService({
    workspaceRoot,
    typescriptVersion: ts.version,
    getProgram: () => program,
  });

  try {
    const statsBefore = service.getStats();
    const rssPoller = startRssPoller();
    const start = performance.now();

    // Simulate editor open-file event: call getDiagnostics once (the full
    // analysis pass that would run when a file is first opened).
    const diagnosticsResult = service.getDiagnostics(fixturePath);

    const wallTimeMs = performance.now() - start;
    const peakRssBytes = rssPoller.stop();
    const statsAfter = service.getStats();

    return {
      wallTimeMs,
      peakRssBytes,
      syntheticCompileCount: statsAfter.syntheticCompileCount - statsBefore.syntheticCompileCount,
      diagnosticsCount: diagnosticsResult.diagnostics.length,
    };
  } finally {
    service.dispose();
  }
}

// ---------------------------------------------------------------------------
// OOM detection via subprocess with memory cap
// ---------------------------------------------------------------------------

/**
 * Runs a single semantic service pass in a child Node.js process capped at
 * `maxOldSpaceMb` MB. Returns `true` if the process ran out of memory.
 */
function detectOom(fixturePath: string, maxOldSpaceMb: number): boolean {
  const scriptTarget = String(ts.ScriptTarget.ES2022);
  const moduleKind = String(ts.ModuleKind.NodeNext);
  const moduleResolution = String(ts.ModuleResolutionKind.NodeNext);
  const workspaceRoot = path.dirname(fixturePath);

  const runnerScript = [
    `import { createProgram } from "typescript";`,
    `import { FormSpecSemanticService } from "@formspec/ts-plugin";`,
    `import * as ts from "typescript";`,
    `const program = createProgram(${JSON.stringify([fixturePath])}, {`,
    `  target: ${scriptTarget},`,
    `  module: ${moduleKind},`,
    `  moduleResolution: ${moduleResolution},`,
    `  strict: true,`,
    `  skipLibCheck: true,`,
    `});`,
    `const service = new FormSpecSemanticService({`,
    `  workspaceRoot: ${JSON.stringify(workspaceRoot)},`,
    `  typescriptVersion: ts.version,`,
    `  getProgram: () => program,`,
    `});`,
    `try {`,
    `  service.getDiagnostics(${JSON.stringify(fixturePath)});`,
    `  process.exit(0);`,
    `} finally {`,
    `  service.dispose();`,
    `}`,
  ].join("\n");

  const tmpDir = os.tmpdir();
  const runnerPath = path.join(tmpDir, `formspec-oom-probe-tsserver-${String(process.pid)}.mjs`);

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

interface StripeRealisticTsserverBaseline {
  readonly phase: "0";
  readonly surface: "tsserver-plugin";
  readonly description: string;
  readonly fixture: string;
  readonly runs: number;
  readonly oomHeapCapMB: number;
  readonly metrics: {
    readonly peakRSS_MB: number;
    readonly wallTime_ms: number;
    readonly didOOM: boolean;
    readonly warmWallTimes_ms: readonly number[];
    readonly allPeakRSS_MB: readonly number[];
    readonly coldWallTime_ms: number;
    readonly syntheticCompileCounts: readonly number[];
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

  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "formspec-stripe-realistic-tsserver-")
  );

  try {
    const fixtureSrc = await fs.readFile(path.join(FIXTURE_DIR, FIXTURE_FILE), "utf8");
    const fixturePath = path.join(workspaceRoot, FIXTURE_FILE);
    await fs.writeFile(fixturePath, fixtureSrc, "utf8");

    // Symlink e2e node_modules so ts.createProgram can find stripe types.
    const e2eNodeModules = path.join(E2E_ROOT, "node_modules");
    const tmpNodeModules = path.join(workspaceRoot, "node_modules");
    await fs.symlink(e2eNodeModules, tmpNodeModules, "dir");

    process.stderr.write(`\n=== Stripe Realistic OOM Sweep — TSServer-Plugin Surface (Phase 0 baseline) ===\n\n`);
    process.stderr.write(`  fixture file: ${FIXTURE_FILE}\n`);
    process.stderr.write(`  surface:      FormSpecSemanticService.getDiagnostics\n`);
    process.stderr.write(`  runs:         ${String(RUNS)} (run 1 = cold)\n`);
    process.stderr.write(`  OOM cap:      ${String(OOM_HEAP_CAP_MB)} MB\n\n`);

    const allWallTimeMs: number[] = [];
    const allPeakRssBytes: number[] = [];
    const allSyntheticCompileCounts: number[] = [];

    process.stderr.write(`  Plugin-path (FormSpecSemanticService.getDiagnostics):\n`);
    for (let i = 0; i < RUNS; i++) {
      const label = i === 0 ? "cold" : "warm";
      process.stderr.write(`    run ${String(i + 1)}/${String(RUNS)} [${label}]...`);
      const result = runTsserverBenchOnce(workspaceRoot, fixturePath);
      allWallTimeMs.push(result.wallTimeMs);
      allPeakRssBytes.push(result.peakRssBytes);
      allSyntheticCompileCounts.push(result.syntheticCompileCount);
      process.stderr.write(
        ` ${result.wallTimeMs.toFixed(1)}ms  RSS=${(result.peakRssBytes / 1024 / 1024).toFixed(1)}MB syntheticCompile=${String(result.syntheticCompileCount)} diags=${String(result.diagnosticsCount)}\n`
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

    process.stderr.write(`\n--- Phase 0 Stripe Realistic TSServer-Plugin Baseline ---\n`);
    process.stderr.write(`  surface:                     tsserver-plugin\n`);
    process.stderr.write(`  wallTime_ms cold:             ${coldWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  wallTime_ms warm (median):    ${medianWarmWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  peakRSS_MB warm (median):    ${peakRSSMB.toFixed(1)} MB\n`);
    process.stderr.write(`  didOOM (${String(OOM_HEAP_CAP_MB)} MB cap):       ${String(didOOM)}\n`);
    process.stderr.write(`  syntheticCompile counts:     [${allSyntheticCompileCounts.join(", ")}]\n`);
    process.stderr.write(`---------------------------------------------------------\n`);
    process.stderr.write(`\n  Phase 4 gate: peakRSS_MB ≤ ${(peakRSSMB * 0.5).toFixed(1)} MB, zero OOM at 1 GB cap\n\n`);

    const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";

    const baseline: StripeRealisticTsserverBaseline = {
      phase: "0",
      surface: "tsserver-plugin",
      description:
        "Stripe realistic OOM sweep — tsserver-plugin surface (FormSpecSemanticService.getDiagnostics, direct Stripe types, no Ref<T> wrapper)",
      fixture: "e2e/fixtures/stripe-realistic-oom/checkout-form.ts",
      runs: RUNS,
      oomHeapCapMB: OOM_HEAP_CAP_MB,
      metrics: {
        peakRSS_MB: Math.round(peakRSSMB * 10) / 10,
        wallTime_ms: Math.round(medianWarmWallTimeMs * 100) / 100,
        didOOM,
        warmWallTimes_ms: warmWallTimeMs.map((v) => Math.round(v * 100) / 100),
        allPeakRSS_MB: allPeakRssBytes.map((v) => Math.round((v / 1024 / 1024) * 10) / 10),
        coldWallTime_ms: Math.round(coldWallTimeMs * 100) / 100,
        syntheticCompileCounts: allSyntheticCompileCounts,
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
