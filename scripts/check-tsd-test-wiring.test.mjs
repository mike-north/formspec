/**
 * Self-tests for the tsd-test-wiring checker.
 *
 * @see https://github.com/mike-north/formspec/issues/556
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { checkTsdTestWiring } from "./check-tsd-test-wiring.mjs";

const execFileAsync = promisify(execFile);
const checkerPath = path.join(import.meta.dirname, "check-tsd-test-wiring.mjs");
const repoRoot = path.dirname(import.meta.dirname);

/**
 * @param {Record<string, string>} files
 * @param {(root: string) => Promise<void>} testFn
 * @returns {Promise<void>}
 */
async function withFixture(files, testFn) {
  const root = await mkdtemp(path.join(tmpdir(), "formspec-tsd-wiring-"));
  try {
    for (const [filePath, contents] of Object.entries(files)) {
      const absolutePath = path.join(root, filePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    }

    await testFn(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

void describe("checkTsdTestWiring", () => {
  void it("passes when no packages directory exists", async () => {
    await withFixture({}, async (root) => {
      const result = await checkTsdTestWiring({ root });
      assert.equal(result.ok, true);
      assert.deepEqual(result.violations, []);
    });
  });

  void it("ignores packages with no *.test-d.ts files", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/foo/tests/example.test.ts": "// runtime test only",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, true);
        assert.deepEqual(result.violations, []);
      }
    );
  });

  void it("flags a package whose test script omits tsd", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/foo/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, false);
        assert.equal(result.violations.length, 1);
        assert.equal(result.violations[0].packageDir, path.join("packages", "foo"));
        assert.equal(result.violations[0].testScript, "vitest run");
        assert.equal(result.violations[0].testDFiles, path.join("tests", "example.test-d.ts"));
      }
    );
  });

  void it("flags a package with no test script at all", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: {} }),
        "packages/foo/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, false);
        assert.equal(result.violations[0].testScript, "(missing)");
      }
    );
  });

  void it("accepts a test script that runs tsd alongside vitest", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: { test: "vitest run && tsd" } }),
        "packages/foo/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, true);
        assert.deepEqual(result.violations, []);
      }
    );
  });

  void it("does not false-positive on scripts that merely mention 'tsd' as a substring", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({
          scripts: { test: "vitest run && echo not-real-tsdoc" },
        }),
        "packages/foo/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, false);
      }
    );
  });

  void it("covers non-packages workspace roots declared in pnpm-workspace.yaml (e2e, examples/*)", async () => {
    // Regression: the guard originally scanned only packages/*, so a
    // *.test-d.ts under the e2e or examples/* workspace roots was invisible —
    // exactly the silent gap #556 exists to prevent.
    await withFixture(
      {
        "pnpm-workspace.yaml": "packages:\n  - packages/*\n  - examples/*\n  - e2e\n",
        "e2e/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "e2e/tests/sample.test-d.ts": "export {};",
        "examples/demo/package.json": JSON.stringify({ scripts: { test: "vitest run && tsd" } }),
        "examples/demo/tests/types.test-d.ts": "export {};",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, false);
        assert.deepEqual(
          result.violations.map((violation) => violation.packageDir),
          ["e2e"]
        );
      }
    );
  });

  void it("finds *.test-d.ts files nested below the tests directory", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/foo/tests/nested/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, false);
        assert.equal(
          result.violations[0].testDFiles,
          path.join("tests", "nested", "example.test-d.ts")
        );
      }
    );
  });

  void it("reports multiple violating packages, sorted by name", async () => {
    await withFixture(
      {
        "packages/zeta/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/zeta/tests/example.test-d.ts": "// type-level test",
        "packages/alpha/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/alpha/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.equal(result.ok, false);
        assert.deepEqual(
          result.violations.map((v) => v.packageDir),
          [path.join("packages", "alpha"), path.join("packages", "zeta")]
        );
      }
    );
  });

  void it("formats an actionable report naming the offending package and fix", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/foo/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        const result = await checkTsdTestWiring({ root });
        assert.match(result.report, /packages[/\\]foo/);
        assert.match(result.report, /tsd/);
      }
    );
  });

  void it("passes for the real repository (regression guard for #556)", async () => {
    const result = await checkTsdTestWiring({ root: repoRoot });
    assert.equal(result.ok, true, result.report);
  });

  void it("exits non-zero and writes an actionable stderr report for violations", async () => {
    await withFixture(
      {
        "packages/foo/package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
        "packages/foo/tests/example.test-d.ts": "// type-level test",
      },
      async (root) => {
        try {
          await execFileAsync(process.execPath, [checkerPath], { cwd: root });
          assert.fail("Expected the tsd-wiring checker to reject the missing wiring");
        } catch (error) {
          assert.equal(typeof error, "object");
          assert.notEqual(error, null);

          const failedProcess = /** @type {{ code?: unknown; stderr?: unknown }} */ (error);
          assert.equal(failedProcess.code, 1);
          assert.equal(typeof failedProcess.stderr, "string");
          assert.match(failedProcess.stderr, /packages[/\\]foo/);
        }
      }
    );
  });

  void it("runs as a CLI entrypoint when invoked with a relative script path", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/check-tsd-test-wiring.mjs"],
      { cwd: repoRoot }
    );

    assert.match(result.stdout, /runs tsd/);
  });
});
