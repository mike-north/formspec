/**
 * Phase 0.5k microbenchmark: synthetic-checker baseline.
 *
 * Measures wall time and synthetic-batch call metrics for
 * {@link buildFormSpecAnalysisFileSnapshot} against the 20-field
 * {@link AnalysisBenchFixture} (30-40 constraint tags total).
 *
 * ### Purpose
 *
 * This is the Phase 0 baseline canary. Phase 4 of the synthetic-checker
 * retirement refactor (see docs/refactors/synthetic-checker-retirement.md §9.2
 * #8) **must not regress** wall time (warm median) against the values stored in
 * `baselines/synthetic-checker-baseline.json`.
 *
 * ### Metrics captured
 *
 * - `wallTimeMs` — end-to-end elapsed time per iteration
 *   - `cold` — run 1 (first invocation; empty module-level LRU cache)
 *   - `warmMedian` — median over runs 2-50
 *   - `warmP95` — 95th-percentile over runs 2-50
 * - `syntheticBatchCallCount` — number of `ts.createProgram` invocations
 *   inside the synthetic-checker per cold/warm run, derived from
 *   `analysis.syntheticCheckBatch.createProgram` performance events
 * - `syntheticBatchCacheHits` / `syntheticBatchCacheMisses` — LRU cache
 *   behaviour over the warm run window (runs 2-50)
 * - `memoryDeltaBytes` — RSS delta between before and after the run set
 *   (coarse; warm runs only)
 *
 * ### Run model
 *
 * 50 iterations total. Run 1 is the **cold run** (first invocation; the
 * module-level LRU cache inside `@formspec/analysis` is empty). Runs 2-50 are
 * **warm runs** (subsequent invocations with the cache populated). Cold and
 * warm statistics are reported separately because cache behaviour differs.
 *
 * Module imports and `ts.createProgram` setup run before the timer starts;
 * they are excluded from per-iteration wall time.
 *
 * ### Run with
 *
 *   pnpm --filter @formspec/e2e run bench:synthetic-checker
 *
 * ### Output
 *
 * JSON to stdout (machine-readable baseline), human-readable table to stderr.
 * Redirect stdout to update the baseline file:
 *
 *   pnpm --filter @formspec/e2e run bench:synthetic-checker \
 *     > benchmarks/baselines/synthetic-checker-baseline.json
 *
 * @see docs/refactors/synthetic-checker-retirement.md §9.2 #8
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import * as ts from "typescript";
import {
  buildFormSpecAnalysisFileSnapshot,
  createFormSpecPerformanceRecorder,
  type FormSpecPerformanceEvent,
} from "@formspec/analysis/internal";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOTAL_RUNS = 50;

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SOURCE_PATH = path.join(BENCH_DIR, "analysis-bench-fixture.ts");

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
};

// ---------------------------------------------------------------------------
// Synthetic-event counters derived from FormSpecPerformanceRecorder events
// ---------------------------------------------------------------------------

interface SyntheticCounts {
  readonly syntheticProgramCount: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
}

function countSyntheticEvents(events: readonly FormSpecPerformanceEvent[]): SyntheticCounts {
  let syntheticProgramCount = 0;
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const event of events) {
    if (
      event.name === "analysis.syntheticCheckBatch.createProgram" ||
      event.name === "analysis.narrowSyntheticCheckBatch.createProgram"
    ) {
      syntheticProgramCount++;
    } else if (
      event.name === "analysis.syntheticCheckBatch.cacheHit" ||
      event.name === "analysis.narrowSyntheticCheckBatch.cacheHit"
    ) {
      cacheHits++;
    } else if (
      event.name === "analysis.syntheticCheckBatch.cacheMiss" ||
      event.name === "analysis.narrowSyntheticCheckBatch.cacheMiss"
    ) {
      cacheMisses++;
    }
  }

  return { syntheticProgramCount, cacheHits, cacheMisses };
}

// ---------------------------------------------------------------------------
// Single-run measurement
// ---------------------------------------------------------------------------

interface RunResult {
  readonly wallTimeMs: number;
  readonly syntheticCounts: SyntheticCounts;
}

function runOnce(checker: ts.TypeChecker, sourceFile: ts.SourceFile): RunResult {
  const recorder = createFormSpecPerformanceRecorder();
  const start = performance.now();
  buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, performance: recorder });
  const wallTimeMs = performance.now() - start;
  return { wallTimeMs, syntheticCounts: countSyntheticEvents(recorder.events) };
}

// ---------------------------------------------------------------------------
// Statistics helpers
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

function p95(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Cannot compute p95 of empty array");
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return sorted[Math.max(0, idx)]!;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Write the fixture to a temp directory so ts.createProgram resolves it as a
  // real file on disk. Module imports happen here (before any timer starts).
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "formspec-synthetic-bench-")
  );

  try {
    const source = await fs.readFile(FIXTURE_SOURCE_PATH, "utf8");
    const fixturePath = path.join(workspaceRoot, "analysis-bench-fixture.ts");
    await fs.writeFile(fixturePath, source, "utf8");

    // Create program + checker once. Each iteration re-uses the same program
    // to isolate the snapshot-building cost from program-creation overhead.
    const program = ts.createProgram([fixturePath], COMPILER_OPTIONS);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(fixturePath);
    if (sourceFile === undefined) {
      throw new Error(`Fixture source file not found in program: ${fixturePath}`);
    }

    process.stderr.write(
      `Running synthetic-checker baseline benchmark (${String(TOTAL_RUNS)} iterations, run 1 = cold)...\n`
    );
    process.stderr.write(`  fixture: ${FIXTURE_SOURCE_PATH}\n\n`);

    const allWallTimeMs: number[] = [];
    const allSyntheticCounts: SyntheticCounts[] = [];

    const rssBefore = process.memoryUsage().rss;

    for (let i = 0; i < TOTAL_RUNS; i++) {
      const label = i === 0 ? "cold" : "warm";
      const result = runOnce(checker, sourceFile);
      allWallTimeMs.push(result.wallTimeMs);
      allSyntheticCounts.push(result.syntheticCounts);

      if (i === 0 || i === TOTAL_RUNS - 1 || (i + 1) % 10 === 0) {
        process.stderr.write(
          `  run ${String(i + 1).padStart(3)}/${String(TOTAL_RUNS)} [${label}]` +
            `  ${result.wallTimeMs.toFixed(2)}ms` +
            `  syntheticPrograms=${String(result.syntheticCounts.syntheticProgramCount)}` +
            `  cacheHits=${String(result.syntheticCounts.cacheHits)}` +
            `  cacheMisses=${String(result.syntheticCounts.cacheMisses)}\n`
        );
      }
    }

    const rssAfter = process.memoryUsage().rss;
    const memoryDeltaBytes = rssAfter - rssBefore;

    // Separate cold (run 1) from warm (runs 2-50).
    const coldWallTimeMs = allWallTimeMs[0] ?? 0;
    const coldSyntheticCounts = allSyntheticCounts[0] ?? {
      syntheticProgramCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
    const warmWallTimeMs = allWallTimeMs.slice(1);

    const warmMedianMs = median(warmWallTimeMs);
    const warmP95Ms = p95(warmWallTimeMs);

    // Aggregate warm cache stats (runs 2-50).
    let warmCacheHits = 0;
    let warmCacheMisses = 0;
    let warmSyntheticProgramCount = 0;
    for (const counts of allSyntheticCounts.slice(1)) {
      warmCacheHits += counts.cacheHits;
      warmCacheMisses += counts.cacheMisses;
      warmSyntheticProgramCount += counts.syntheticProgramCount;
    }

    // Human-readable summary to stderr.
    process.stderr.write("\n--- Phase 0.5k Synthetic-Checker Baseline ---\n");
    process.stderr.write(
      `  wallTimeMs cold:               ${coldWallTimeMs.toFixed(2)}\n`
    );
    process.stderr.write(
      `  wallTimeMs warm (median):      ${warmMedianMs.toFixed(2)}\n`
    );
    process.stderr.write(
      `  wallTimeMs warm (p95):         ${warmP95Ms.toFixed(2)}\n`
    );
    process.stderr.write(
      `  syntheticProgramCount (cold):  ${String(coldSyntheticCounts.syntheticProgramCount)}\n`
    );
    process.stderr.write(
      `  syntheticProgramCount (warm):  ${String(warmSyntheticProgramCount)} total over ${String(warmWallTimeMs.length)} runs\n`
    );
    process.stderr.write(
      `  cacheHits (warm total):        ${String(warmCacheHits)}\n`
    );
    process.stderr.write(
      `  cacheMisses (warm total):      ${String(warmCacheMisses)}\n`
    );
    process.stderr.write(
      `  memoryDeltaBytes:              ${String(memoryDeltaBytes)} (${(memoryDeltaBytes / 1024 / 1024).toFixed(1)} MB)\n`
    );
    process.stderr.write("---------------------------------------------\n");

    // Machine-readable JSON to stdout for baseline capture.
    const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";
    const output = {
      phase: "0.5k",
      description: "synthetic-checker snapshot-path baseline",
      fixture: "AnalysisBenchFixture (20 fields, ~36 constraint tags)",
      totalRuns: TOTAL_RUNS,
      metrics: {
        wallTimeMs: {
          cold: coldWallTimeMs,
          warmMedian: warmMedianMs,
          warmP95: warmP95Ms,
          allWarm: warmWallTimeMs,
          note: "Run 1 (cold) is the first invocation with an empty module-level LRU cache. Runs 2-50 are warm (cache populated). Module-import overhead and ts.createProgram/TypeChecker construction are excluded — the timer wraps only buildFormSpecAnalysisFileSnapshot.",
        },
        syntheticBatchCalls: {
          coldProgramCount: coldSyntheticCounts.syntheticProgramCount,
          coldCacheHits: coldSyntheticCounts.cacheHits,
          coldCacheMisses: coldSyntheticCounts.cacheMisses,
          warmProgramCountTotal: warmSyntheticProgramCount,
          warmCacheHitsTotal: warmCacheHits,
          warmCacheMissesTotal: warmCacheMisses,
          warmRunCount: warmWallTimeMs.length,
          note: "Derived from FormSpecPerformanceRecorder events. After the cold run the module-level LRU cache is warm, so subsequent runs produce cache hits and syntheticProgramCount of 0.",
        },
        memoryDeltaBytes: {
          value: memoryDeltaBytes,
          note: "RSS delta between start of run loop and end. Coarse estimate; GC timing affects accuracy.",
        },
      },
      commitSha,
      timestamp: new Date().toISOString(),
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
