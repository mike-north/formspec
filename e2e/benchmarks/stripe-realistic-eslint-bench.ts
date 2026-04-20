/**
 * Phase 0 baseline: Stripe realistic OOM sweep — ESLint surface.
 *
 * Runs `@formspec/eslint-plugin`'s `type-compatibility/tag-type-check` rule against a fixture
 * that embeds Stripe types DIRECTLY — no Ref<T> wrapper. This surface
 * exercises the ESLint rule's own TypeChecker path, which is separate from
 * the build/snapshot surfaces and may have different memory behavior.
 *
 * The ESLint `tag-type-check` rule uses `@typescript-eslint/parser` to
 * create a TypeChecker, then calls into `@formspec/analysis` to validate
 * constraint tag types. If this surface takes significantly more memory than
 * the build surface, that's a distinct user-facing finding.
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
 *   pnpm --filter @formspec/e2e run bench:stripe-realistic-eslint
 *
 * Surface label: "eslint"
 * Baseline: e2e/bench/baselines/stripe-realistic-eslint-baseline.json
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { ESLint } from "eslint";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import eslintPlugin from "@formspec/eslint-plugin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const E2E_ROOT = path.resolve(BENCH_DIR, "..");
const FIXTURE_DIR = path.join(E2E_ROOT, "fixtures", "stripe-realistic-oom");
const BASELINE_DIR = path.join(E2E_ROOT, "bench", "baselines");
const BASELINE_PATH = path.join(BASELINE_DIR, "stripe-realistic-eslint-baseline.json");
const FIXTURE_FILE = "checkout-form.ts";
const RUNS = 3;
const OOM_HEAP_CAP_MB = 1024;

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
// Single benchmark run (ESLint path)
// ---------------------------------------------------------------------------

interface EslintRunResult {
  readonly wallTimeMs: number;
  readonly peakRssBytes: number;
  readonly errorCount: number;
  readonly warningCount: number;
}

async function runEslintBenchOnce(
  workspaceRoot: string,
  fixturePath: string,
  tsconfigPath: string
): Promise<EslintRunResult> {
  const eslint = new ESLint({
    // Set cwd to the temp workspace so files within it are not ignored by ESLint's
    // flat-config base-path logic ("File ignored because outside of base path").
    cwd: workspaceRoot,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parser: typescriptEslintParser as any,
          parserOptions: {
            project: tsconfigPath,
          },
        },
        plugins: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
          "formspec": eslintPlugin as any,
        },
        rules: {
          "formspec/type-compatibility/tag-type-check": "error",
        },
      },
    ],
  });

  const rssPoller = startRssPoller();
  const start = performance.now();

  const results = await eslint.lintFiles([fixturePath]);

  const wallTimeMs = performance.now() - start;
  const peakRssBytes = rssPoller.stop();

  const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
  const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

  return { wallTimeMs, peakRssBytes, errorCount, warningCount };
}

// ---------------------------------------------------------------------------
// OOM detection via subprocess with memory cap
// ---------------------------------------------------------------------------

/**
 * Runs a single ESLint pass in a child Node.js process capped at
 * `maxOldSpaceMb` MB. Returns `true` if the process ran out of memory.
 *
 * The probe script replicates the main bench setup: copies the fixture to
 * a temp workspace, symlinks e2e node_modules, writes a tsconfig, then
 * runs ESLint with cwd set to the workspace root.
 */
function detectOom(_fixturePath: string, _tsconfigPath: string, maxOldSpaceMb: number): boolean {
  const e2eRoot = E2E_ROOT;
  const fixtureFile = FIXTURE_FILE;

  const runnerScript = [
    `import { ESLint } from "eslint";`,
    `import * as typescriptEslintParser from "@typescript-eslint/parser";`,
    `import eslintPlugin from "@formspec/eslint-plugin";`,
    `import fs from "node:fs/promises";`,
    `import fsSync from "node:fs";`,
    `import os from "node:os";`,
    `import path from "node:path";`,
    `const e2eRoot = ${JSON.stringify(e2eRoot)};`,
    `const fixtureFile = ${JSON.stringify(fixtureFile)};`,
    `const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "formspec-oom-eslint-probe-"));`,
    `const fixtureSrc = await fs.readFile(path.join(e2eRoot, "fixtures", "stripe-realistic-oom", fixtureFile), "utf8");`,
    `const fixturePath = path.join(workspaceRoot, fixtureFile);`,
    `await fs.writeFile(fixturePath, fixtureSrc, "utf8");`,
    `const tsconfigPath = path.join(workspaceRoot, "tsconfig.json");`,
    `await fs.writeFile(tsconfigPath, JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true } }), "utf8");`,
    `await fs.symlink(path.join(e2eRoot, "node_modules"), path.join(workspaceRoot, "node_modules"), "dir");`,
    `const eslint = new ESLint({`,
    `  cwd: workspaceRoot,`,
    `  overrideConfigFile: true,`,
    `  overrideConfig: [{`,
    `    files: ["**/*.ts"],`,
    `    languageOptions: {`,
    `      parser: typescriptEslintParser,`,
    `      parserOptions: { project: tsconfigPath },`,
    `    },`,
    `    plugins: { "formspec": eslintPlugin },`,
    `    rules: { "formspec/type-compatibility/tag-type-check": "error" },`,
    `  }],`,
    `});`,
    `await eslint.lintFiles([fixturePath]);`,
    `await fs.rm(workspaceRoot, { recursive: true, force: true });`,
    `process.exit(0);`,
  ].join("\n");

  const tmpDir = os.tmpdir();
  const runnerPath = path.join(tmpDir, `formspec-oom-probe-eslint-${String(process.pid)}.mjs`);

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

interface StripeRealisticEslintBaseline {
  readonly phase: "0";
  readonly surface: "eslint";
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
    readonly errorCount: number;
    readonly warningCount: number;
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
    path.join(os.tmpdir(), "formspec-stripe-realistic-eslint-")
  );

  try {
    const fixtureSrc = await fs.readFile(path.join(FIXTURE_DIR, FIXTURE_FILE), "utf8");
    const fixturePath = path.join(workspaceRoot, FIXTURE_FILE);
    await fs.writeFile(fixturePath, fixtureSrc, "utf8");

    // Create a tsconfig.json in the temp workspace pointing to e2e node_modules
    // so @typescript-eslint/parser can resolve the stripe types.
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
      },
      include: [FIXTURE_FILE],
    };
    const tsconfigPath = path.join(workspaceRoot, "tsconfig.json");
    await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2), "utf8");

    // Symlink e2e node_modules so the TypeScript parser can find stripe types.
    const e2eNodeModules = path.join(E2E_ROOT, "node_modules");
    const tmpNodeModules = path.join(workspaceRoot, "node_modules");
    await fs.symlink(e2eNodeModules, tmpNodeModules, "dir");

    process.stderr.write(`\n=== Stripe Realistic OOM Sweep — ESLint Surface (Phase 0 baseline) ===\n\n`);
    process.stderr.write(`  fixture file: ${FIXTURE_FILE}\n`);
    process.stderr.write(`  rule:         formspec/type-compatibility/tag-type-check\n`);
    process.stderr.write(`  runs:         ${String(RUNS)} (run 1 = cold)\n`);
    process.stderr.write(`  OOM cap:      ${String(OOM_HEAP_CAP_MB)} MB\n\n`);

    const allWallTimeMs: number[] = [];
    const allPeakRssBytes: number[] = [];
    let lastErrorCount = 0;
    let lastWarningCount = 0;

    process.stderr.write(`  ESLint-path (tag-type-check rule):\n`);
    for (let i = 0; i < RUNS; i++) {
      const label = i === 0 ? "cold" : "warm";
      process.stderr.write(`    run ${String(i + 1)}/${String(RUNS)} [${label}]...`);
      const result = await runEslintBenchOnce(workspaceRoot, fixturePath, tsconfigPath);
      allWallTimeMs.push(result.wallTimeMs);
      allPeakRssBytes.push(result.peakRssBytes);
      lastErrorCount = result.errorCount;
      lastWarningCount = result.warningCount;
      process.stderr.write(
        ` ${result.wallTimeMs.toFixed(1)}ms  RSS=${(result.peakRssBytes / 1024 / 1024).toFixed(1)}MB errors=${String(result.errorCount)} warnings=${String(result.warningCount)}\n`
      );
    }

    const warmWallTimeMs = allWallTimeMs.slice(1);
    const warmPeakRssBytes = allPeakRssBytes.slice(1);

    const medianWarmWallTimeMs = warmWallTimeMs.length > 0 ? median(warmWallTimeMs) : (allWallTimeMs[0] ?? 0);
    const medianWarmPeakRssBytes = warmPeakRssBytes.length > 0 ? median(warmPeakRssBytes) : (allPeakRssBytes[0] ?? 0);
    const coldWallTimeMs = allWallTimeMs[0] ?? 0;
    const peakRSSMB = medianWarmPeakRssBytes / 1024 / 1024;

    process.stderr.write(`\n  OOM probe (${String(OOM_HEAP_CAP_MB)} MB cap)...\n`);
    const didOOM = detectOom(fixturePath, tsconfigPath, OOM_HEAP_CAP_MB);
    process.stderr.write(`    didOOM: ${String(didOOM)}\n`);

    process.stderr.write(`\n--- Phase 0 Stripe Realistic ESLint Baseline ---\n`);
    process.stderr.write(`  surface:                     eslint\n`);
    process.stderr.write(`  wallTime_ms cold:             ${coldWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  wallTime_ms warm (median):    ${medianWarmWallTimeMs.toFixed(2)}\n`);
    process.stderr.write(`  peakRSS_MB warm (median):    ${peakRSSMB.toFixed(1)} MB\n`);
    process.stderr.write(`  didOOM (${String(OOM_HEAP_CAP_MB)} MB cap):       ${String(didOOM)}\n`);
    process.stderr.write(`  lint errors:                 ${String(lastErrorCount)}\n`);
    process.stderr.write(`  lint warnings:               ${String(lastWarningCount)}\n`);
    process.stderr.write(`-------------------------------------------------\n`);
    process.stderr.write(`\n  Phase 4 gate: peakRSS_MB ≤ ${(peakRSSMB * 0.5).toFixed(1)} MB, zero OOM at 1 GB cap\n\n`);

    const commitSha = process.env["GIT_COMMIT_SHA"] ?? "unknown";

    const baseline: StripeRealisticEslintBaseline = {
      phase: "0",
      surface: "eslint",
      description:
        "Stripe realistic OOM sweep — ESLint surface (tag-type-check rule, direct Stripe types, no Ref<T> wrapper)",
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
        errorCount: lastErrorCount,
        warningCount: lastWarningCount,
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
