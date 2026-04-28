import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { promisify } from "node:util";

import {
  assertWorkspaceTypeScriptPeerDependencyRangesAligned,
  computeTypeScriptMinorSmokeMatrix,
  formatGitHubOutput,
  parseSupportedTypeScriptRange,
  readTypeScriptPeerDependency,
  readWorkspaceTypeScriptPeerDependencyRanges,
} from "./compute-typescript-minor-smoke-matrix.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = path.join(import.meta.dirname, "compute-typescript-minor-smoke-matrix.mjs");
const repoRoot = path.dirname(import.meta.dirname);

/**
 * @param {Record<string, string>} files
 * @param {(root: string) => void | Promise<void>} testFn
 * @returns {Promise<void>}
 */
async function withFixture(files, testFn) {
  const root = await mkdtemp(path.join(tmpdir(), "formspec-ts-minor-smoke-"));
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

/**
 * @param {string} range
 * @returns {string}
 */
function packageJsonWithTypeScriptPeer(range) {
  return JSON.stringify({ peerDependencies: { typescript: range } });
}

void describe("parseSupportedTypeScriptRange", () => {
  void it("parses the supported TypeScript peer-dependency range format", () => {
    assert.deepEqual(parseSupportedTypeScriptRange(">=5.7.3 <7"), {
      lowMajor: 5,
      lowMinor: 7,
      lowPatch: 3,
      highMajor: 7,
    });
  });

  void it("rejects unsupported range formats", () => {
    assert.throws(
      () => parseSupportedTypeScriptRange("^5.7.3 || ^6.0.0"),
      /Cannot parse TypeScript peer-dependency range/
    );
  });
});

void describe("readTypeScriptPeerDependency", () => {
  void it("reads the representative package TypeScript peer range", () => {
    assert.equal(readTypeScriptPeerDependency(), ">=5.7.3 <7");
  });
});

void describe("workspace TypeScript peer range guard", () => {
  void it("keeps the representative peer range aligned with all TypeScript peer packages", () => {
    const referenceRange = readTypeScriptPeerDependency();
    const ranges = readWorkspaceTypeScriptPeerDependencyRanges(repoRoot);

    assert.deepEqual(
      ranges.map((entry) => entry.packageJsonPath),
      [
        "packages/analysis/package.json",
        "packages/build/package.json",
        "packages/eslint-plugin/package.json",
        "packages/ts-plugin/package.json",
      ]
    );
    assert.deepEqual([...new Set(ranges.map((entry) => entry.range))], [referenceRange]);
  });

  void it("fails loudly when TypeScript peer ranges drift", async () => {
    await withFixture(
      {
        "packages/analysis/package.json": packageJsonWithTypeScriptPeer(">=5.7.3 <7"),
        "packages/build/package.json": packageJsonWithTypeScriptPeer(">=5.9.0 <7"),
      },
      (root) => {
        assert.throws(() => {
          assertWorkspaceTypeScriptPeerDependencyRangesAligned(">=5.7.3 <7", root);
        }, /packages\/build\/package\.json: >=5\.9\.0 <7/);
      }
    );
  });
});

void describe("computeTypeScriptMinorSmokeMatrix", () => {
  void it("pins the latest stable patch for every supported minor", () => {
    const include = computeTypeScriptMinorSmokeMatrix({
      peerDependencyRange: ">=5.7.3 <7",
      versions: [
        "5.6.3",
        "5.7.2",
        "5.7.3",
        "5.8.0-beta",
        "5.8.2",
        "5.8.3",
        "5.9.3",
        "6.0.0-dev.20260416",
        "6.0.2",
        "6.0.3",
        "7.0.0",
      ],
    });

    assert.deepEqual(include, [
      { label: "5.7", typescript: "5.7.3" },
      { label: "5.8", typescript: "5.8.3" },
      { label: "5.9", typescript: "5.9.3" },
      { label: "6.0", typescript: "6.0.3" },
    ]);
  });

  void it("shrinks the matrix when the lower bound moves forward", () => {
    const include = computeTypeScriptMinorSmokeMatrix({
      peerDependencyRange: ">=5.9.0 <7",
      versions: ["5.7.3", "5.8.3", "5.9.2", "5.9.3", "6.0.3"],
    });

    assert.deepEqual(include, [
      { label: "5.9", typescript: "5.9.3" },
      { label: "6.0", typescript: "6.0.3" },
    ]);
  });

  void it("honors the lower-bound patch for the first supported minor", () => {
    const include = computeTypeScriptMinorSmokeMatrix({
      peerDependencyRange: ">=5.8.2 <7",
      versions: ["5.8.0", "5.8.1", "5.8.2", "5.8.3", "5.9.0"],
    });

    assert.deepEqual(include, [
      { label: "5.8", typescript: "5.8.3" },
      { label: "5.9", typescript: "5.9.0" },
    ]);
  });

  void it("sorts matrix rows numerically and deterministically", () => {
    const include = computeTypeScriptMinorSmokeMatrix({
      peerDependencyRange: ">=5.9.0 <7",
      versions: ["6.10.1", "6.2.4", "6.0.3", "5.10.2", "5.9.3"],
    });

    assert.deepEqual(
      include.map((row) => row.label),
      ["5.9", "5.10", "6.0", "6.2", "6.10"]
    );
  });

  void it("fails loudly when no stable versions satisfy the peer range", () => {
    assert.throws(
      () =>
        computeTypeScriptMinorSmokeMatrix({
          peerDependencyRange: ">=5.7.3 <7",
          versions: ["5.7.2", "5.8.0-beta", "7.0.0"],
        }),
      /No stable TypeScript versions satisfy/
    );
  });
});

void describe("formatGitHubOutput", () => {
  void it("formats include rows for direct GITHUB_OUTPUT append", () => {
    assert.equal(
      formatGitHubOutput([{ label: "5.7", typescript: "5.7.3" }]),
      'include=[{"label":"5.7","typescript":"5.7.3"}]'
    );
  });
});

void describe("CLI entrypoint", () => {
  void it("prints workflow-facing GitHub output from fixture metadata and npm versions", async () => {
    await withFixture(
      {
        "packages/analysis/package.json": packageJsonWithTypeScriptPeer(">=5.7.3 <7"),
        "packages/build/package.json": packageJsonWithTypeScriptPeer(">=5.7.3 <7"),
        "bin/npm": [
          "#!/usr/bin/env sh",
          'if [ "$1" = "view" ] && [ "$2" = "typescript" ] && [ "$3" = "versions" ] && [ "$4" = "--json" ]; then',
          '  printf \'%s\\n\' \'["5.7.3","5.8.3","5.9.0-beta","5.9.3","6.0.3","7.0.0"]\'',
          "else",
          '  echo "unexpected npm args: $*" >&2',
          "  exit 2",
          "fi",
        ].join("\n"),
      },
      async (root) => {
        await chmod(path.join(root, "bin/npm"), 0o755);

        const result = await execFileAsync(process.execPath, [scriptPath], {
          env: {
            ...process.env,
            FORMSPEC_REPO_ROOT: root,
            PATH: [path.join(root, "bin"), process.env.PATH ?? ""].join(path.delimiter),
          },
        });

        assert.equal(
          result.stdout.trim(),
          'include=[{"label":"5.7","typescript":"5.7.3"},{"label":"5.8","typescript":"5.8.3"},{"label":"5.9","typescript":"5.9.3"},{"label":"6.0","typescript":"6.0.3"}]'
        );
        assert.equal(result.stderr, "");
      }
    );
  });
});
