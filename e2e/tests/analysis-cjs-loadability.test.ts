import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Regression test for a tsserver-plugin load failure introduced in PR #305.
 *
 * `constraint-validator-logger.ts` used `createRequire(import.meta.url)` at
 * module top level. When tsup bundled `@formspec/analysis/internal` to CJS,
 * `import.meta.url` was emitted as `undefined`, causing `createRequire` to
 * throw at module-load time. The tsserver plugin loads `@formspec/analysis/internal`
 * via CJS and was silently crashing before it could write its manifest.
 *
 * This test ensures every CJS bundle of `@formspec/analysis` loads without
 * throwing when required from a plain CJS process.
 */
describe("@formspec/analysis CJS bundle loadability", () => {
  const bundles = ["dist/index.cjs", "dist/protocol.cjs", "dist/internal.cjs"];

  it.each(bundles)("loads %s without throwing", async (relativePath) => {
    const absolutePath = path.join(repoRoot, "packages/analysis", relativePath);
    await fs.access(absolutePath);

    const { stdout } = await execFileAsync(
      process.execPath,
      ["-e", `require(${JSON.stringify(absolutePath)}); console.log("OK");`],
      { cwd: repoRoot }
    );
    expect(stdout.trim()).toBe("OK");
  });
});
