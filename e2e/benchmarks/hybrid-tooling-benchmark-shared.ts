export type HybridBenchmarkMode =
  | "direct-semantic-service"
  | "plugin-ipc"
  | "packaged-language-server";
export type HybridBenchmarkOperation = "diagnostics" | "completion" | "hover";

export interface HybridBenchmarkScenario {
  readonly id: string;
  readonly description: string;
  readonly files: Readonly<Record<string, string>>;
  readonly diagnosticsFiles: readonly string[];
  readonly interactionFile: string;
  readonly interactionNeedle: string;
  readonly interactionOffsetDelta: number;
}

export interface HybridBenchmarkStats {
  readonly fileSnapshotCacheHits: number;
  readonly fileSnapshotCacheMisses: number;
  readonly syntheticBatchCacheHits: number;
  readonly syntheticBatchCacheMisses: number;
  readonly syntheticCompileCount: number;
  readonly syntheticCompileApplications: number;
}

export interface HybridBenchmarkResult {
  readonly scenarioId: string;
  readonly mode: HybridBenchmarkMode;
  readonly operation: HybridBenchmarkOperation;
  readonly startupMs: number;
  readonly coldMs: number;
  readonly warmMs: number;
  readonly summary: string;
  readonly stats: HybridBenchmarkStats;
}

export const HYBRID_BENCHMARK_SCENARIOS: readonly HybridBenchmarkScenario[] = [
  {
    id: "mixed-single-file",
    description:
      "Single-file mix of direct and path-targeted constraints with both valid and invalid diagnostics.",
    files: {
      "checkout.ts": `
        export class Checkout {
          /**
           * @minimum 0
           * @maximum 10000
           * @multipleOf 5
           */
          amount!: number;

          /**
           * @minimum :price 0
           * @maximum :price 10000
           * @minimum :tax 0
           * @minLength :currency 3
           * @maxLength :currency 3
           */
          lineItem!: {
            price: number;
            tax: number;
            currency: string;
            label: string;
          };

          /**
           * @minimum :label 0
           * @minimum :missing 0
           */
          broken!: {
            amount: number;
            label: string;
          };
        }
      `,
    },
    diagnosticsFiles: ["checkout.ts"],
    interactionFile: "checkout.ts",
    interactionNeedle: "price",
    interactionOffsetDelta: 2,
  },
  {
    id: "repeated-path-targets",
    description:
      "Repeated path-targeted numeric constraints in one file, used as a canary for batch scaling.",
    files: {
      "pricing.ts": `
        export class PricingSnapshot {
          /**
           * @minimum :subtotal 0
           * @maximum :subtotal 100000
           * @minimum :tax 0
           * @maximum :tax 10000
           * @minimum :total 0
           * @maximum :total 110000
           */
          totals!: {
            subtotal: number;
            tax: number;
            total: number;
            currency: string;
          };
        }
      `,
    },
    diagnosticsFiles: ["pricing.ts"],
    interactionFile: "pricing.ts",
    interactionNeedle: "subtotal",
    interactionOffsetDelta: 3,
  },
  {
    id: "multi-file-workspace",
    description:
      "Two-file workspace that exercises snapshot reuse across more than one analyzed file.",
    files: {
      "checkout.ts": `
        export class CheckoutLine {
          /**
           * @minimum :amount 0
           * @maximum :amount 5000
           * @minLength :currency 3
           * @maxLength :currency 3
           */
          price!: {
            amount: number;
            currency: string;
          };
        }
      `,
      "invoice.ts": `
        export class InvoiceLine {
          /**
           * @minimum :net 0
           * @maximum :net 10000
           * @minimum :gross 0
           * @maximum :gross 12000
           * @minimum :label 0
           */
          totals!: {
            net: number;
            gross: number;
            label: string;
          };
        }
      `,
    },
    diagnosticsFiles: ["checkout.ts", "invoice.ts"],
    interactionFile: "checkout.ts",
    interactionNeedle: "amount",
    interactionOffsetDelta: 2,
  },
];

export function subtractHybridBenchmarkStats(
  after: HybridBenchmarkStats,
  before: HybridBenchmarkStats
): HybridBenchmarkStats {
  return {
    fileSnapshotCacheHits: after.fileSnapshotCacheHits - before.fileSnapshotCacheHits,
    fileSnapshotCacheMisses: after.fileSnapshotCacheMisses - before.fileSnapshotCacheMisses,
    syntheticBatchCacheHits: after.syntheticBatchCacheHits - before.syntheticBatchCacheHits,
    syntheticBatchCacheMisses: after.syntheticBatchCacheMisses - before.syntheticBatchCacheMisses,
    syntheticCompileCount: after.syntheticCompileCount - before.syntheticCompileCount,
    syntheticCompileApplications:
      after.syntheticCompileApplications - before.syntheticCompileApplications,
  };
}

export function renderHybridToolingBenchmarkReport(
  results: readonly HybridBenchmarkResult[]
): string {
  const lines: string[] = [
    "# Hybrid Tooling Benchmark",
    "",
    "Compares the three supported reference-integration modes:",
    "",
    "- `direct-semantic-service`: downstream host calls `FormSpecSemanticService` directly",
    "- `plugin-ipc`: consumer talks to `FormSpecPluginService` through the manifest/socket transport",
    "- `packaged-language-server`: consumer uses the packaged language-server helper assembly on top of the same transport",
    "",
    "Interpretation notes:",
    "",
    "- `startupMs` is the wrapper/service startup cost before the measured query path runs",
    "- `coldMs` is the first query against a fresh mode/scenario instance",
    "- `warmMs` repeats the same query immediately after to show cache reuse",
    "- snapshot and synthetic cache counters come from the semantic service that actually performed the work",
    "",
  ];

  for (const scenario of HYBRID_BENCHMARK_SCENARIOS) {
    const scenarioResults = results.filter((result) => result.scenarioId === scenario.id);
    lines.push(`## ${scenario.id}`);
    lines.push("");
    lines.push(scenario.description);
    lines.push("");
    lines.push(
      "| Operation | Mode | Startup (ms) | Cold (ms) | Warm (ms) | Snapshot H/M | Synthetic H/M | Compiles | Applications | Summary |"
    );
    lines.push("| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |");

    for (const result of scenarioResults) {
      const snapshotCacheSummary = formatCountPair(
        result.stats.fileSnapshotCacheHits,
        result.stats.fileSnapshotCacheMisses
      );
      const syntheticCacheSummary = formatCountPair(
        result.stats.syntheticBatchCacheHits,
        result.stats.syntheticBatchCacheMisses
      );
      lines.push(
        `| ${result.operation} | ${result.mode} | ${formatMs(result.startupMs)} | ${formatMs(
          result.coldMs
        )} | ${formatMs(result.warmMs)} | ${snapshotCacheSummary} | ${syntheticCacheSummary} | ${formatCount(result.stats.syntheticCompileCount)} | ${formatCount(result.stats.syntheticCompileApplications)} | ${result.summary} |`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

function formatMs(value: number): string {
  return value.toFixed(1);
}

function formatCount(value: number): string {
  return String(value);
}

function formatCountPair(left: number, right: number): string {
  return `${formatCount(left)}/${formatCount(right)}`;
}
