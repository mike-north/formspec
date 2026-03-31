import { renderHybridToolingBenchmarkReport } from "./hybrid-tooling-benchmark-shared.js";
import { runHybridToolingBenchmarks } from "./hybrid-tooling-benchmark.js";

const results = await runHybridToolingBenchmarks();
process.stdout.write(`${renderHybridToolingBenchmarkReport(results)}\n`);
