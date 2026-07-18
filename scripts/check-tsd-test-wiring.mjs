#!/usr/bin/env node
/**
 * Structural guard: any package that ships `*.test-d.ts` files must actually
 * run `tsd` as part of its `test` script.
 *
 * Without this gate, a package can accumulate type-level tests (tsd's
 * `expectType`/`expectError` assertions) that never execute anywhere — the
 * files typecheck as ordinary TypeScript (often excluded from `tsc --noEmit`
 * via `tsconfig.json`'s `exclude`), vitest ignores them, and a green build
 * proves nothing about them.
 *
 * @see https://github.com/mike-north/formspec/issues/556
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * @typedef {object} TsdTestWiringViolation
 * @property {string} packageDir - Package directory, relative to `root` (e.g. "packages/dsl").
 * @property {string} testDFiles - Comma-separated list of `*.test-d.ts` files found, relative to `packageDir`.
 * @property {string} testScript - The package's current `scripts.test` value (or "(missing)").
 *
 * @typedef {object} TsdTestWiringResult
 * @property {boolean} ok
 * @property {TsdTestWiringViolation[]} violations
 * @property {string} report
 */

/**
 * Recursively finds `*.test-d.ts` files under `dir`.
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function findTestDFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  /** @type {string[]} */
  const found = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findTestDFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".test-d.ts")) {
      found.push(entryPath);
    }
  }

  return found;
}

/**
 * @param {string} filePath
 * @returns {Promise<{ scripts?: Record<string, string> }>}
 */
async function readPackageJsonScripts(filePath) {
  const raw = await readFile(filePath, "utf8");
  /** @type {unknown} */
  const parsed = JSON.parse(raw);
  return /** @type {{ scripts?: Record<string, string> }} */ (parsed);
}

/**
 * Whether a package's `test` script invokes `tsd` as a distinct command —
 * substring matching alone would false-positive on scripts that merely
 * mention "tsd" as part of another word (e.g. a hypothetical "tsdoc" step).
 *
 * @param {string} testScript
 * @returns {boolean}
 */
function invokesTsd(testScript) {
  const tokens = testScript
    .split(/&&|\|\||[;|]/)
    .flatMap((segment) => segment.trim().split(/\s+/));
  return tokens.includes("tsd");
}

/**
 * Expands the workspace member patterns from pnpm-workspace.yaml into
 * repo-relative package directories. Supports the two shapes the file uses:
 * a literal directory ("e2e") and a single-level glob ("packages/*").
 * Deriving members from the workspace file (instead of hardcoding
 * "packages/") keeps the guard honest for every root that can contain a
 * package with *.test-d.ts files — e2e and examples/* included.
 *
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function listWorkspacePackageDirs(root) {
  /** @type {string} */
  let workspaceYaml;
  try {
    workspaceYaml = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // No workspace manifest (e.g. minimal fixtures): fall back to the
      // conventional single root.
      workspaceYaml = "packages:\n  - packages/*\n";
    } else {
      throw error;
    }
  }
  const patterns = [];
  let inPackages = false;
  for (const line of workspaceYaml.split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const item = /^\s+-\s+(\S+)\s*$/.exec(line);
      if (item?.[1] !== undefined) {
        patterns.push(item[1]);
        continue;
      }
      if (line.trim() !== "") {
        inPackages = false;
      }
    }
  }

  /** @type {string[]} */
  const dirs = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      /** @type {import("node:fs").Dirent[]} */
      let entries;
      try {
        entries = await readdir(path.join(root, base), { withFileTypes: true });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          continue;
        }
        throw error;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          dirs.push(path.join(base, entry.name));
        }
      }
    } else {
      dirs.push(pattern);
    }
  }
  return dirs.sort((a, b) => a.localeCompare(b));
}

/**
 * @param {{ root?: string }} [options]
 * @returns {Promise<TsdTestWiringResult>}
 */
export async function checkTsdTestWiring(options = {}) {
  const root = options.root ?? process.cwd();

  /** @type {TsdTestWiringViolation[]} */
  const violations = [];

  for (const packageDir of await listWorkspacePackageDirs(root)) {
    const testDFiles = await findTestDFiles(path.join(root, packageDir, "tests"));
    if (testDFiles.length === 0) {
      continue;
    }

    const packageJsonPath = path.join(root, packageDir, "package.json");
    /** @type {{ scripts?: Record<string, string> }} */
    let packageJson;
    try {
      packageJson = await readPackageJsonScripts(packageJsonPath);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const testScript = packageJson.scripts?.test;
    if (testScript === undefined || !invokesTsd(testScript)) {
      violations.push({
        packageDir,
        testDFiles: testDFiles
          .map((filePath) => path.relative(path.join(root, packageDir), filePath))
          .sort()
          .join(", "),
        testScript: testScript ?? "(missing)",
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    report: formatReport(violations),
  };
}

/**
 * @param {TsdTestWiringViolation[]} violations
 * @returns {string}
 */
function formatReport(violations) {
  if (violations.length === 0) {
    return "[check-tsd-test-wiring] Every package with *.test-d.ts files runs tsd in its test script.";
  }

  const lines = [
    "[check-tsd-test-wiring] Packages contain *.test-d.ts files but their `test` script does not run tsd:",
    ...violations.map(
      (v) => `- ${v.packageDir} (${v.testDFiles}) — scripts.test = ${JSON.stringify(v.testScript)}`
    ),
    'Fix: add "&& tsd" to the package\'s "test" script (see packages/core/package.json for the pattern).',
  ];

  return lines.join("\n");
}

const cliPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
const isCliEntry = cliPath === fileURLToPath(import.meta.url);

if (isCliEntry) {
  const result = await checkTsdTestWiring();
  if (result.ok) {
    globalThis.console.log(result.report);
  } else {
    globalThis.console.error(result.report);
  }
  process.exit(result.ok ? 0 : 1);
}
