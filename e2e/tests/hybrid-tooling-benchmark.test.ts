import { describe, expect, it } from "vitest";
import {
  HYBRID_BENCHMARK_SCENARIOS,
  renderHybridToolingBenchmarkReport,
  subtractHybridBenchmarkStats,
  type HybridBenchmarkStats,
  type HybridBenchmarkResult,
} from "../benchmarks/hybrid-tooling-benchmark-shared.js";

describe("hybrid tooling benchmark harness", () => {
  it("covers mixed, repeated, and multi-file benchmark scenarios", () => {
    expect(HYBRID_BENCHMARK_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "mixed-single-file",
      "repeated-path-targets",
      "multi-file-workspace",
    ]);

    expect(
      HYBRID_BENCHMARK_SCENARIOS.some((scenario) => Object.keys(scenario.files).length > 1)
    ).toBe(true);
    expect(
      HYBRID_BENCHMARK_SCENARIOS.every((scenario) =>
        scenario.diagnosticsFiles.every((fileName) => fileName in scenario.files)
      )
    ).toBe(true);
  });

  it("renders a readable markdown report for the comparison matrix", () => {
    const sampleResults: readonly HybridBenchmarkResult[] = [
      {
        scenarioId: "mixed-single-file",
        mode: "direct-semantic-service",
        operation: "diagnostics",
        startupMs: 0,
        coldMs: 12.5,
        warmMs: 2.1,
        summary: "2 canonical diagnostics",
        stats: {
          fileSnapshotCacheHits: 1,
          fileSnapshotCacheMisses: 1,
          syntheticBatchCacheHits: 0,
          syntheticBatchCacheMisses: 1,
          syntheticCompileCount: 1,
          syntheticCompileApplications: 2,
        },
      },
    ];

    const report = renderHybridToolingBenchmarkReport(sampleResults);

    expect(report).toContain("# Hybrid Tooling Benchmark");
    expect(report).toContain("mixed-single-file");
    expect(report).toContain("direct-semantic-service");
    expect(report).toContain("2 canonical diagnostics");
    expect(report).toContain("| Operation | Mode | Startup (ms) |");
    expect(report).toContain(
      "| diagnostics | direct-semantic-service | 0.0 | 12.5 | 2.1 | 1/1 | 0/1 | 1 | 2 | 2 canonical diagnostics |"
    );
  });

  it("renders scenario sections even when there are no measured results yet", () => {
    const report = renderHybridToolingBenchmarkReport([]);

    expect(report).toContain("# Hybrid Tooling Benchmark");
    expect(report).toContain("## mixed-single-file");
    expect(report).toContain("## repeated-path-targets");
    expect(report).toContain("## multi-file-workspace");
  });

  it("subtracts cache counters deterministically", () => {
    const before: HybridBenchmarkStats = {
      fileSnapshotCacheHits: 1,
      fileSnapshotCacheMisses: 2,
      syntheticBatchCacheHits: 3,
      syntheticBatchCacheMisses: 4,
      syntheticCompileCount: 5,
      syntheticCompileApplications: 6,
    };
    const after: HybridBenchmarkStats = {
      fileSnapshotCacheHits: 4,
      fileSnapshotCacheMisses: 8,
      syntheticBatchCacheHits: 9,
      syntheticBatchCacheMisses: 10,
      syntheticCompileCount: 11,
      syntheticCompileApplications: 14,
    };

    expect(subtractHybridBenchmarkStats(after, before)).toEqual({
      fileSnapshotCacheHits: 3,
      fileSnapshotCacheMisses: 6,
      syntheticBatchCacheHits: 6,
      syntheticBatchCacheMisses: 6,
      syntheticCompileCount: 6,
      syntheticCompileApplications: 8,
    });
  });
});
