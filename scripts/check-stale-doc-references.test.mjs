import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import { checkStaleDocReferences } from "./check-stale-doc-references.mjs";

const execFileAsync = promisify(execFile);
const checkerPath = path.join(import.meta.dirname, "check-stale-doc-references.mjs");
const repoRoot = path.dirname(import.meta.dirname);

/**
 * @param {Record<string, string>} files
 * @param {(root: string) => Promise<void>} testFn
 * @returns {Promise<void>}
 */
async function withFixture(files, testFn) {
  const root = await mkdtemp(path.join(tmpdir(), "formspec-stale-docs-"));
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

void describe("checkStaleDocReferences", () => {
  void it("rejects missing scan roots instead of passing cleanly", async () => {
    const missingRoot = path.join(
      tmpdir(),
      `formspec-stale-docs-missing-${String(process.pid)}-${String(Date.now())}`
    );

    await rm(missingRoot, { force: true, recursive: true });

    await assert.rejects(() => checkStaleDocReferences({ root: missingRoot }), {
      code: "ENOENT",
    });
  });

  void it("flags each blocked literal in root Markdown files", async () => {
    await withFixture(
      {
        "README.md": [
          "Old tests lived in src/__tests__/.",
          "Old package name was @formspec/constraints.",
          "Old package path was packages/constraints/src/types.ts.",
        ].join("\n"),
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, false);
        assert.deepEqual(
          result.matches.map((match) => match.pattern),
          ["src/__tests__/", "@formspec/constraints", "packages/constraints/"]
        );
        assert.deepEqual(
          result.matches.map((match) => [match.filePath, match.line, match.column]),
          [
            ["README.md", 1, 20],
            ["README.md", 2, 22],
            ["README.md", 3, 22],
          ]
        );
      }
    );
  });

  void it("flags blocked literals in docs Markdown files", async () => {
    await withFixture(
      {
        "docs/006-parity-testing.md": "Use src/__tests__/parity/ here.",
        "docs/current/nested.md": "Use @formspec/constraints here.",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, false);
        assert.deepEqual(result.matches, [
          {
            filePath: "docs/006-parity-testing.md",
            line: 1,
            column: 5,
            pattern: "src/__tests__/",
          },
          {
            filePath: "docs/current/nested.md",
            line: 1,
            column: 5,
            pattern: "@formspec/constraints",
          },
        ]);
      }
    );
  });

  void it("flags retired benchmark wording in current benchmark docs and sources", async () => {
    await withFixture(
      {
        "e2e/README.md": [
          "Measures `generateSchemasFromProgram` wall time, peak RSS, and synthetic `ts.createProgram`",
          "invocation count.",
        ].join("\n"),
        "e2e/benchmarks/README.md": [
          "Reports synthetic-program count.",
          "Historical synthetic ts.createProgram wording.",
        ].join("\n"),
        "e2e/benchmarks/analysis-bench.ts":
          "const note = 'empty synthetic-batch cache in the synthetic constraint-checker';",
        "e2e/benchmarks/stripe-realistic-tsserver-bench.ts":
          "syntheticCompileCount — ts.createProgram invocations per run",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, false);
        assert.deepEqual(result.matches, [
          {
            filePath: "e2e/benchmarks/analysis-bench.ts",
            line: 1,
            column: 21,
            pattern: "synthetic-batch cache",
          },
          {
            filePath: "e2e/benchmarks/analysis-bench.ts",
            line: 1,
            column: 50,
            pattern: "synthetic constraint-checker",
          },
          {
            filePath: "e2e/benchmarks/README.md",
            line: 1,
            column: 9,
            pattern: "synthetic-program count",
          },
          {
            filePath: "e2e/benchmarks/README.md",
            line: 2,
            column: 12,
            pattern: "synthetic ts.createProgram",
          },
          {
            filePath: "e2e/benchmarks/stripe-realistic-tsserver-bench.ts",
            line: 1,
            column: 25,
            pattern: "ts.createProgram invocations per run",
          },
          {
            filePath: "e2e/README.md",
            line: 1,
            column: 64,
            pattern: "synthetic `ts.createProgram`",
          },
        ]);
      }
    );
  });

  void it("accepts current test paths", async () => {
    await withFixture(
      {
        "ARCHITECTURE.md": [
          "Parity tests live in packages/build/tests/parity/.",
          "Fixtures now live in tests/fixtures/.",
        ].join("\n"),
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, true);
        assert.deepEqual(result.matches, []);
      }
    );
  });

  void it("accepts current benchmark cache wording", async () => {
    await withFixture(
      {
        "e2e/README.md": "Measures file-snapshot cache hit/miss totals.",
        "e2e/benchmarks/README.md": "Reports file-snapshot cache hit/miss totals.",
        "e2e/benchmarks/analysis-bench.ts": "const note = 'empty file-snapshot cache';",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, true);
        assert.deepEqual(result.matches, []);
      }
    );
  });

  void it("does not flag compatibility field names by themselves", async () => {
    await withFixture(
      {
        "e2e/benchmarks/stripe-realistic-tsserver-bench.ts":
          "readonly syntheticCompileCount: number;",
        "e2e/README.md": "`syntheticProgramCount` = 0 after synthetic deletion.",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, true);
        assert.deepEqual(result.matches, []);
      }
    );
  });

  void it("does not scan archival refactor docs", async () => {
    await withFixture(
      {
        "docs/refactors/archive.md": "Historical path: src/__tests__/legacy.test.ts",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, true);
      }
    );
  });

  void it("does not scan package changelogs or generated package docs", async () => {
    await withFixture(
      {
        "packages/core/CHANGELOG.md": "Historical path: src/__tests__/legacy.test.ts",
        "packages/config/docs/constraints.md": "Historical name: @formspec/constraints",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, true);
      }
    );
  });

  void it("formats actionable diagnostics with file, line, and column", async () => {
    await withFixture(
      {
        "CLAUDE.md": "Before src/__tests__/ after",
      },
      async (root) => {
        const result = await checkStaleDocReferences({ root });

        assert.equal(result.ok, false);
        assert.match(result.report, /CLAUDE\.md:1:8/);
        assert.match(result.report, /src\/__tests__\//);
      }
    );
  });

  void it("exits non-zero and writes actionable stderr for stale references", async () => {
    await withFixture(
      {
        "README.md": "Before src/__tests__/ after",
      },
      async (root) => {
        try {
          await execFileAsync(process.execPath, [checkerPath], { cwd: root });
          assert.fail("Expected the stale-reference checker to reject stale Markdown");
        } catch (error) {
          assert.equal(typeof error, "object");
          assert.notEqual(error, null);

          const failedProcess = /** @type {{ code?: unknown; stderr?: unknown }} */ (error);
          assert.equal(failedProcess.code, 1);
          assert.equal(typeof failedProcess.stderr, "string");
          assert.match(failedProcess.stderr, /README\.md:1:8/);
          assert.match(failedProcess.stderr, /src\/__tests__\//);
        }
      }
    );
  });

  void it("runs as a CLI entrypoint when invoked with a relative script path", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/check-stale-doc-references.mjs"],
      {
        cwd: repoRoot,
      }
    );

    assert.match(result.stdout, /No stale doc references found/);
  });
});
