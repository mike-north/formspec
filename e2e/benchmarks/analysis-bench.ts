/**
 * Phase 0-C microbenchmark: analysis-pipeline baseline.
 *
 * Measures build-path timing and plugin-path cache behavior against the
 * 20-field AnalysisBenchFixture:
 *
 *   1. wallTimeMs             — build-path end-to-end elapsed time
 *   2. peakRssBytes           — build-path peak resident set size
 *   3. fileSnapshotCache      — plugin-path cache hit/miss deltas
 *
 * ### Run model
 *
 * Five runs are collected per metric path. For the build path, run 1 is the
 * **cold run** for the measured call (first invocation/JIT effects; module
 * imports run before the timer starts). Runs 2–5 are **warm runs**, and the
 * median is computed over warm runs for wall time and RSS.
 *
 * For the plugin path, each run creates a fresh `FormSpecSemanticService` and
 * records file-snapshot cache deltas for one diagnostics query. Those deltas
 * show initial snapshot behavior for the query path, not cross-run cache reuse.
 *
 * ### File-snapshot cache methodology
 *
 * TypeScript 5.9+ exports are sealed (non-configurable getters), so
 * monkey-patching `ts.createProgram` at runtime is not possible on Node.js 24.
 * Instead the benchmark drives `FormSpecSemanticService` diagnostics for the
 * fixture file and reads `getStats()` before and after each fresh-service
 * query. The file-snapshot cache deltas exercise the same host-program,
 * typed-parser validation model while keeping the benchmark aligned with
 * single-program analysis.
 *
 * Run with:
 *   pnpm --filter @formspec/e2e run bench:analysis
 *
 * Output: JSON to stdout, human-readable table to stderr.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import * as ts from "typescript";
import { generateSchemasFromProgram } from "@formspec/build";
import { FormSpecSemanticService } from "@formspec/ts-plugin";

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

  // Ensure the interval doesn't block process exit.
  if (typeof id.unref === "function") id.unref();

  return {
    stop: () => {
      clearInterval(id);
      // Take one final sample after the work completes.
      const final = process.memoryUsage().rss;
      if (final > peak) peak = final;
      return peak;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture file setup
// ---------------------------------------------------------------------------

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SOURCE_PATH = path.join(BENCH_DIR, "analysis-bench-fixture.ts");
const TYPE_NAME = "AnalysisBenchFixture";

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
};

// ---------------------------------------------------------------------------
// Wall-time + RSS measurement: generateSchemasFromProgram path
// ---------------------------------------------------------------------------

interface BuildRunResult {
  readonly wallTimeMs: number;
  readonly peakRssBytes: number;
}

function runBuildBenchOnce(filePath: string): BuildRunResult {
  const program = ts.createProgram([filePath], COMPILER_OPTIONS);

  const rssPoller = startRssPoller();
  const start = performance.now();

  // Use "diagnostics" so validation errors do not abort the run —
  // we want to measure the full pipeline cost regardless of fixture validity.
  generateSchemasFromProgram({
    program,
    filePath,
    typeName: TYPE_NAME,
    errorReporting: "diagnostics",
  });

  const wallTimeMs = performance.now() - start;
  const peakRssBytes = rssPoller.stop();

  return { wallTimeMs, peakRssBytes };
}

// ---------------------------------------------------------------------------
// §5 Phase 5C — parallel program-construction measurement is retired.
//
// Historically this benchmark reported `syntheticCompileCount` from
// FormSpecSemanticService.getStats() as a proxy for how many parallel
// ts.createProgram calls the analysis pipeline was issuing. That stats field
// has been removed with the synthetic TypeScript program. The plugin-path loop
// is kept to continue measuring fresh-service query-path cache deltas, which
// remain meaningful for wall-time / RSS tracking.
// ---------------------------------------------------------------------------

interface PluginRunResult {
  readonly fileSnapshotCacheHits: number;
  readonly fileSnapshotCacheMisses: number;
}

function runPluginBenchOnce(workspaceRoot: string, filePath: string): PluginRunResult {
  const program = ts.createProgram([filePath], COMPILER_OPTIONS);

  const service = new FormSpecSemanticService({
    workspaceRoot,
    typescriptVersion: ts.version,
    getProgram: () => program,
  });

  try {
    const before = service.getStats();
    service.getDiagnostics(filePath);
    const after = service.getStats();
    return {
      fileSnapshotCacheHits: after.fileSnapshotCacheHits - before.fileSnapshotCacheHits,
      fileSnapshotCacheMisses: after.fileSnapshotCacheMisses - before.fileSnapshotCacheMisses,
    };
  } finally {
    service.dispose();
  }
}

// ---------------------------------------------------------------------------
// Median helper (over an array of numbers)
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
// Main
// ---------------------------------------------------------------------------

const RUNS = 5;

async function main(): Promise<void> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-analysis-bench-"));

  try {
    // Write the fixture TypeScript file to a temp directory so ts.createProgram
    // can resolve it as a real file.
    const source = await fs.readFile(FIXTURE_SOURCE_PATH, "utf8");
    const fixturePath = path.join(workspaceRoot, "analysis-bench-fixture.ts");
    await fs.writeFile(fixturePath, source, "utf8");

    process.stderr.write(`Running analysis benchmark (${String(RUNS)} runs, run 1 = cold)...\n`);
    process.stderr.write(`  fixture: ${FIXTURE_SOURCE_PATH}\n`);
    process.stderr.write(`  type:    ${TYPE_NAME}\n\n`);

    // --- Build-path measurements (wall time + RSS) ---
    const allWallTimeMs: number[] = [];
    const allPeakRssBytes: number[] = [];

    process.stderr.write("  Build-path (generateSchemasFromProgram):\n");
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

    // Warm median = median over runs 2..5 (skip run 1 which includes module load)
    const warmWallTimeMs = allWallTimeMs.slice(1);
    const warmPeakRssBytes = allPeakRssBytes.slice(1);

    // --- TS-plugin-path measurements ---
    // §5 Phase 5C — no more synthetic program counter; we still record
    // file-snapshot cache hit/miss deltas for fresh-service diagnostics
    // queries because they are useful for tracking snapshot-construction
    // behavior.
    const allPluginResults: PluginRunResult[] = [];

    process.stderr.write("\n  Plugin-path (FormSpecSemanticService.getDiagnostics):\n");
    for (let i = 0; i < RUNS; i++) {
      process.stderr.write(`    run ${String(i + 1)}/${String(RUNS)} [fresh-service]...`);
      const result = runPluginBenchOnce(workspaceRoot, fixturePath);
      allPluginResults.push(result);
      process.stderr.write(
        ` fileSnapshotCacheHits=${String(result.fileSnapshotCacheHits)} misses=${String(result.fileSnapshotCacheMisses)}\n`
      );
    }

    const medianWarmWallTimeMs = median(warmWallTimeMs);
    const medianWarmPeakRssBytes = median(warmPeakRssBytes);

    const coldWallTimeMs = allWallTimeMs[0] ?? 0;

    // Human-readable summary to stderr
    process.stderr.write("\n--- Analysis Baseline (Phase 5C) ---\n");
    process.stderr.write(`  wallTimeMs cold:             ${coldWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  wallTimeMs warm (median):    ${medianWarmWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(
      `  peakRssBytes warm (median):  ${String(Math.round(medianWarmPeakRssBytes))} (${(medianWarmPeakRssBytes / 1024 / 1024).toFixed(1)} MB)\n`
    );
    process.stderr.write("-----------------------------------\n");

    // Machine-readable JSON to stdout for CI ingestion
    const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";
    const output = {
      phase: "0-C",
      description: "analysis-pipeline baseline",
      fixture: TYPE_NAME,
      runs: RUNS,
      metrics: {
        wallTimeMs: {
          cold: coldWallTimeMs,
          warmMedian: medianWarmWallTimeMs,
          all: allWallTimeMs,
          path: "generateSchemasFromProgram",
          note: "Run 1 (cold) measures the first invocation of generateSchemasFromProgram. Module imports run before the timer starts, so module-load overhead is excluded. Warm median (runs 2-5) is the steady-state cost.",
        },
        peakRssBytes: {
          warmMedian: medianWarmPeakRssBytes,
          all: allPeakRssBytes,
          path: "generateSchemasFromProgram",
        },
        fileSnapshotCache: {
          hits: allPluginResults.map((r) => r.fileSnapshotCacheHits),
          misses: allPluginResults.map((r) => r.fileSnapshotCacheMisses),
          path: "FormSpecSemanticService.getDiagnostics",
          note:
            "§5 Phase 5C — `syntheticProgramCount` retired with the synthetic " +
            "program batch. `fileSnapshotCache.hits/misses` now provide the " +
            "fresh-service query-path signal: each run creates a new " +
            "FormSpecSemanticService and records cache deltas for one " +
            "diagnostics query.",
        },
      },
      commitSha,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

await main();
