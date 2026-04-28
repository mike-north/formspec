#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const STALE_PATTERNS = [
  "src/__tests__/",
  "@formspec/constraints",
  "packages/constraints/",
  "synthetic `ts.createProgram`",
  "synthetic ts.createProgram",
  "ts.createProgram invocations per run",
  "synthetic-program count",
  "synthetic-batch cache",
  "synthetic constraint-checker",
];

/**
 * @typedef {object} StaleDocReferenceMatch
 * @property {string} filePath
 * @property {number} line
 * @property {number} column
 * @property {string} pattern
 *
 * @typedef {object} StaleDocReferenceResult
 * @property {boolean} ok
 * @property {StaleDocReferenceMatch[]} matches
 * @property {string} report
 *
 * @typedef {object} CurrentFileScanOptions
 * @property {boolean} [optional]
 */

/**
 * The gate covers current repo guidance and docs. Archival refactor notes,
 * package changelogs, and generated package docs may preserve old names.
 *
 * @param {string} root
 * @returns {AsyncGenerator<string>}
 */
async function* currentGuidanceFiles(root) {
  yield* currentTopLevelFiles(root, "", (name) => name.endsWith(".md"));
  yield* currentTopLevelFiles(root, "e2e", (name) => name.endsWith(".md"), { optional: true });
  yield* currentDocsMarkdownFiles(root, "docs", { optional: true });
  yield* currentTopLevelFiles(
    root,
    "e2e/benchmarks",
    (name) => name.endsWith(".md") || name.endsWith(".ts"),
    { optional: true }
  );
}

/**
 * Top-level files in selected guidance directories are current documentation
 * surfaces. Nested benchmark baselines and archival fixtures are intentionally
 * out of scope for this gate.
 *
 * @param {string} root
 * @param {string} relativeDir
 * @param {(name: string) => boolean} matches
 * @param {CurrentFileScanOptions} [options]
 * @returns {AsyncGenerator<string>}
 */
async function* currentTopLevelFiles(root, relativeDir, matches, options = {}) {
  let entries;
  try {
    entries = await readdir(path.join(root, relativeDir || "."), { withFileTypes: true });
  } catch (error) {
    if (options.optional && error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return;
      }
    }

    throw error;
  }

  for (const entry of entries) {
    if (entry.isFile() && matches(entry.name)) {
      yield relativeDir === "" ? entry.name : path.posix.join(relativeDir, entry.name);
    }
  }
}

/**
 * @param {string} root
 * @param {string} relativeDir
 * @param {CurrentFileScanOptions} [options]
 * @returns {AsyncGenerator<string>}
 */
async function* currentDocsMarkdownFiles(root, relativeDir, options = {}) {
  if (relativeDir === "docs/refactors") {
    return;
  }

  let entries;
  try {
    entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
  } catch (error) {
    if (options.optional && error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return;
      }
    }

    throw error;
  }

  for (const entry of entries) {
    const childPath = path.posix.join(relativeDir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".md")) {
      yield childPath;
    } else if (entry.isDirectory()) {
      yield* currentDocsMarkdownFiles(root, childPath);
    }
  }
}

/**
 * @param {string} source
 * @param {string} pattern
 * @returns {Array<{ line: number; column: number }>}
 */
function findPatternLocations(source, pattern) {
  const locations = [];

  for (const [lineIndex, lineText] of source.split("\n").entries()) {
    let fromIndex = 0;
    let patternIndex = lineText.indexOf(pattern, fromIndex);

    while (patternIndex !== -1) {
      locations.push({ line: lineIndex + 1, column: patternIndex + 1 });
      fromIndex = patternIndex + pattern.length;
      patternIndex = lineText.indexOf(pattern, fromIndex);
    }
  }

  return locations;
}

/**
 * @param {StaleDocReferenceMatch[]} matches
 * @returns {string}
 */
function formatReport(matches) {
  if (matches.length === 0) {
    return "[check-stale-doc-references] No stale doc references found.";
  }

  const lines = [
    "[check-stale-doc-references] Stale doc references found:",
    ...matches.map(
      (match) =>
        `- ${match.filePath}:${String(match.line)}:${String(match.column)} uses ${JSON.stringify(
          match.pattern
        )}`
    ),
  ];

  return lines.join("\n");
}

/**
 * @param {{ root?: string }} [options]
 * @returns {Promise<StaleDocReferenceResult>}
 */
export async function checkStaleDocReferences(options = {}) {
  const root = options.root ?? process.cwd();
  /** @type {StaleDocReferenceMatch[]} */
  const matches = [];

  for await (const filePath of currentGuidanceFiles(root)) {
    const source = await readFile(path.join(root, filePath), "utf8");
    for (const pattern of STALE_PATTERNS) {
      for (const location of findPatternLocations(source, pattern)) {
        matches.push({ filePath, ...location, pattern });
      }
    }
  }

  matches.sort((a, b) => {
    const byFile = a.filePath.localeCompare(b.filePath);
    if (byFile !== 0) return byFile;
    const byLine = a.line - b.line;
    if (byLine !== 0) return byLine;
    return a.column - b.column;
  });

  return {
    ok: matches.length === 0,
    matches,
    report: formatReport(matches),
  };
}

const cliPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
const isCliEntry = cliPath === fileURLToPath(import.meta.url);

if (isCliEntry) {
  const result = await checkStaleDocReferences();
  if (result.ok) {
    globalThis.console.log(result.report);
  } else {
    globalThis.console.error(result.report);
  }
  process.exit(result.ok ? 0 : 1);
}
