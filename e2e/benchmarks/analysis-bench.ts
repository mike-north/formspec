/**
 * Phase 0-C microbenchmark: analysis-pipeline baseline.
 *
 * Measures three metrics for a single `generateSchemasFromProgram` call
 * against the 20-field AnalysisBenchFixture:
 *
 *   1. wallTimeMs      — end-to-end elapsed time
 *   2. peakRssBytes    — peak resident set size observed via polling
 *   3. syntheticProgramCount — ts.createProgram invocations inside the
 *                             synthetic constraint-checker
 *
 * ### Run model
 *
 * Five runs are collected per metric path. Run 1 is the **cold run** (module
 * load + empty synthetic-batch cache). Runs 2–5 are **warm runs** (TypeScript
 * module already loaded; synthetic-batch cache populated). Median is computed
 * over warm runs (2–5) for wall time and RSS. The cold-run synthetic-program
 * count is reported separately because subsequent runs hit the module-level
 * LRU cache in @formspec/analysis and produce a count of 0.
 *
 * ### Synthetic-program count methodology
 *
 * TypeScript 5.9+ exports are sealed (non-configurable getters), so
 * monkey-patching `ts.createProgram` at runtime is not possible on Node.js 24.
 * Instead the count is obtained via the `FormSpecSemanticService` from
 * `@formspec/ts-plugin`, which exposes `syntheticCompileCount` in its
 * `getStats()` method and increments it on every synthetic-checker
 * `ts.createProgram` call. The service is driven to produce diagnostics for
 * the fixture file, which exercises the same constraint-validation path as
 * `generateSchemasFromProgram`.
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
// Synthetic-program-count measurement: FormSpecSemanticService path
//
// The semantic service drives the same @formspec/analysis synthetic-checker
// as the build path. It exposes syntheticCompileCount via getStats(), giving
// us an exact count of ts.createProgram invocations inside the checker.
//
// NOTE: @formspec/analysis has a module-level LRU cache for synthetic-batch
// results. After the first (cold) run, subsequent runs of the same fixture
// produce cache hits and a compile count of 0. We therefore report the cold
// and warm counts separately rather than computing a misleading median across
// all runs.
// ---------------------------------------------------------------------------

interface PluginRunResult {
  readonly syntheticProgramCount: number;
  readonly syntheticBatchCacheHits: number;
  readonly syntheticBatchCacheMisses: number;
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
      syntheticProgramCount: after.syntheticCompileCount - before.syntheticCompileCount,
      syntheticBatchCacheHits:
        after.syntheticBatchCacheHits - before.syntheticBatchCacheHits,
      syntheticBatchCacheMisses:
        after.syntheticBatchCacheMisses - before.syntheticBatchCacheMisses,
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
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "formspec-analysis-bench-")
  );

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

    // --- TS-plugin-path measurements (syntheticProgramCount) ---
    const allSyntheticCounts: PluginRunResult[] = [];

    process.stderr.write("\n  Plugin-path (FormSpecSemanticService.getDiagnostics):\n");
    for (let i = 0; i < RUNS; i++) {
      const label = i === 0 ? "cold" : "warm";
      process.stderr.write(`    run ${String(i + 1)}/${String(RUNS)} [${label}]...`);
      const result = runPluginBenchOnce(workspaceRoot, fixturePath);
      allSyntheticCounts.push(result);
      process.stderr.write(
        ` syntheticPrograms=${String(result.syntheticProgramCount)} cacheHits=${String(result.syntheticBatchCacheHits)} cacheMisses=${String(result.syntheticBatchCacheMisses)}\n`
      );
    }

    const medianWarmWallTimeMs = median(warmWallTimeMs);
    const medianWarmPeakRssBytes = median(warmPeakRssBytes);
    const coldSyntheticProgramCount = allSyntheticCounts[0]?.syntheticProgramCount ?? 0;

    const coldWallTimeMs = allWallTimeMs[0] ?? 0;

    // Human-readable summary to stderr
    process.stderr.write("\n--- Phase 0-C Analysis Baseline ---\n");
    process.stderr.write(
      `  wallTimeMs cold:             ${coldWallTimeMs.toFixed(2)}\n`
    );
    process.stderr.write(
      `  wallTimeMs warm (median):    ${medianWarmWallTimeMs.toFixed(2)}\n`
    );
    process.stderr.write(
      `  peakRssBytes warm (median):  ${String(Math.round(medianWarmPeakRssBytes))} (${(medianWarmPeakRssBytes / 1024 / 1024).toFixed(1)} MB)\n`
    );
    process.stderr.write(
      `  syntheticProgramCount cold:  ${String(coldSyntheticProgramCount)}\n`
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
          note: "Run 1 (cold) includes TypeScript module load + empty synthetic-batch cache. Warm median (runs 2-5) is the steady-state cost.",
        },
        peakRssBytes: {
          warmMedian: medianWarmPeakRssBytes,
          all: allPeakRssBytes,
          path: "generateSchemasFromProgram",
        },
        syntheticProgramCount: {
          cold: coldSyntheticProgramCount,
          all: allSyntheticCounts.map((r) => r.syntheticProgramCount),
          cacheHits: allSyntheticCounts.map((r) => r.syntheticBatchCacheHits),
          cacheMisses: allSyntheticCounts.map((r) => r.syntheticBatchCacheMisses),
          path: "FormSpecSemanticService.getDiagnostics",
          note: "TypeScript 5.9+ sealed exports prevent direct monkey-patching. Count from FormSpecSemanticService.getStats().syntheticCompileCount. Only run 1 (cold) produces a non-zero count — subsequent runs hit the module-level LRU cache in @formspec/analysis.",
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
