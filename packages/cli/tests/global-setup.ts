/**
 * Vitest global setup for the CLI package.
 *
 * The subprocess test suites (dry-run-subprocess.test.ts,
 * exit-codes-subprocess.test.ts) spawn the built CLI binary at
 * dist/index.js. Building it here — once, before any test file runs —
 * avoids a race where multiple test files run concurrently in separate
 * vitest workers, each independently sees a missing dist/index.js, and
 * each starts its own `pnpm exec tsup` build at the same time.
 *
 * Vitest runs a `globalSetup` module's default export exactly once per
 * `vitest run` invocation, before any test file is scheduled, regardless of
 * how many files or workers run the tests themselves.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";

const packageDir = path.resolve(__dirname, "..");
const cliPath = path.join(packageDir, "dist", "index.js");

export default function setup(): void {
  if (existsSync(cliPath)) {
    return;
  }

  // This subprocess suite only needs the runnable CLI entrypoint. Avoid
  // `pnpm run build` here because the package build also runs declaration
  // generation and API Extractor, which pull in broader workspace
  // prerequisites unrelated to this runtime smoke test.
  const buildResult = spawnSync("pnpm", ["exec", "tsup"], {
    cwd: packageDir,
    encoding: "utf-8",
  });

  if (buildResult.status !== 0 || !existsSync(cliPath)) {
    throw new Error(
      [
        "Failed to build CLI test artifact at dist/index.js.",
        buildResult.stdout,
        buildResult.stderr,
      ]
        .filter((part) => part.length > 0)
        .join("\n")
    );
  }
}
