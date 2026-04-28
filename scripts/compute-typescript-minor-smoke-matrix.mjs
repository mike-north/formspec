#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.dirname(import.meta.dirname);
const REPRESENTATIVE_PEER_DEPENDENCY_PACKAGE_JSON = "packages/analysis/package.json";

/**
 * @typedef {object} SupportedTypeScriptRange
 * @property {number} lowMajor
 * @property {number} lowMinor
 * @property {number} lowPatch
 * @property {number} highMajor
 *
 * @typedef {object} TypeScriptMinorSmokeMatrixRow
 * @property {string} label
 * @property {string} typescript
 *
 * @typedef {object} TypeScriptPeerDependencyRange
 * @property {string} packageJsonPath
 * @property {string} range
 */

/**
 * Parse the TypeScript peer-dependency range shape used by FormSpec packages.
 * The smoke matrix intentionally supports this one explicit format so changes
 * to the supported-version policy fail loudly instead of producing stale rows.
 *
 * @param {string} range
 * @returns {SupportedTypeScriptRange}
 */
export function parseSupportedTypeScriptRange(range) {
  const match = /^\s*>=(\d+)\.(\d+)\.(\d+)\s+<(\d+)(?:\.0\.0)?\s*$/.exec(range);

  if (match === null) {
    throw new Error(`Cannot parse TypeScript peer-dependency range: ${JSON.stringify(range)}`);
  }

  const [, lowMajor, lowMinor, lowPatch, highMajor] = match.map(Number);
  return { lowMajor, lowMinor, lowPatch, highMajor };
}

/**
 * Parse stable TypeScript versions only. Pre-release and nightly versions are
 * intentionally excluded because Tier 3 is minor-release smoke coverage; beta
 * and nightly tracks are already covered by the per-PR matrix.
 *
 * @param {string} version
 * @returns {{ major: number; minor: number; patch: number } | undefined}
 */
function parseStableVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    return undefined;
  }

  const [, major, minor, patch] = match.map(Number);
  return { major, minor, patch };
}

/**
 * Compare a stable TypeScript version tuple against the peer-dependency bounds.
 *
 * @param {{ major: number; minor: number; patch: number }} version
 * @param {SupportedTypeScriptRange} range
 * @returns {boolean}
 */
function isWithinSupportedRange(version, range) {
  if (version.major >= range.highMajor) {
    return false;
  }

  if (version.major > range.lowMajor) {
    return true;
  }

  if (version.major !== range.lowMajor) {
    return false;
  }

  if (version.minor > range.lowMinor) {
    return true;
  }

  return version.minor === range.lowMinor && version.patch >= range.lowPatch;
}

/**
 * Validate JSON-like records before reading package metadata. The helper keeps
 * JSON.parse results typed as unknown until the object shape is checked.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isStringKeyedRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = /** @type {unknown} */ (Object.getPrototypeOf(value));
  return prototype === Object.prototype || prototype === null;
}

/**
 * Resolve the repository root. Tests can override this so the CLI path can be
 * exercised against fixture package metadata without touching the real repo.
 *
 * @returns {string}
 */
function resolveRepoRoot() {
  return process.env.FORMSPEC_REPO_ROOT ?? DEFAULT_REPO_ROOT;
}

/**
 * Resolve the representative package.json path used by the workflow matrix.
 *
 * @returns {string}
 */
function resolveRepresentativePeerDependencyPackageJson() {
  return path.join(resolveRepoRoot(), REPRESENTATIVE_PEER_DEPENDENCY_PACKAGE_JSON);
}

/**
 * Parse a package.json file into a validated JSON object.
 *
 * @param {string} packageJsonPath
 * @returns {Record<string, unknown>}
 */
function readPackageJsonRecord(packageJsonPath) {
  const packageJson = /** @type {unknown} */ (JSON.parse(readFileSync(packageJsonPath, "utf8")));

  if (!isStringKeyedRecord(packageJson)) {
    throw new Error(`${packageJsonPath} must contain a JSON object`);
  }

  return packageJson;
}

/**
 * Compute the GitHub Actions matrix rows by grouping stable TypeScript versions
 * by major/minor and keeping only the latest patch in each supported minor.
 *
 * @param {{ peerDependencyRange: string; versions: string[] }} options
 * @returns {TypeScriptMinorSmokeMatrixRow[]}
 */
export function computeTypeScriptMinorSmokeMatrix({ peerDependencyRange, versions }) {
  const supportedRange = parseSupportedTypeScriptRange(peerDependencyRange);
  /** @type {Map<string, { major: number; minor: number; patch: number; version: string }>} */
  const latestPatchPerMinor = new Map();

  for (const version of versions) {
    const parsed = parseStableVersion(version);
    if (parsed === undefined || !isWithinSupportedRange(parsed, supportedRange)) {
      continue;
    }

    const key = [String(parsed.major), String(parsed.minor)].join(".");
    const previous = latestPatchPerMinor.get(key);
    if (previous === undefined || parsed.patch > previous.patch) {
      latestPatchPerMinor.set(key, { ...parsed, version });
    }
  }

  const include = [...latestPatchPerMinor.values()]
    .sort((a, b) => a.major - b.major || a.minor - b.minor)
    .map((entry) => ({
      label: [String(entry.major), String(entry.minor)].join("."),
      typescript: entry.version,
    }));

  if (include.length === 0) {
    throw new Error(
      `No stable TypeScript versions satisfy peer-dependency range ${JSON.stringify(
        peerDependencyRange
      )}`
    );
  }

  return include;
}

/**
 * Read the representative package peer dependency that defines FormSpec's
 * supported TypeScript range for the minor-smoke workflow.
 *
 * @param {string} packageJsonPath
 * @returns {string}
 */
export function readTypeScriptPeerDependency(
  packageJsonPath = resolveRepresentativePeerDependencyPackageJson()
) {
  const packageJson = readPackageJsonRecord(packageJsonPath);
  const peerDependencies = packageJson.peerDependencies;
  if (!isStringKeyedRecord(peerDependencies)) {
    throw new Error(`${packageJsonPath} does not declare peerDependencies`);
  }

  const range = peerDependencies.typescript;

  if (typeof range !== "string") {
    throw new Error(`${packageJsonPath} does not declare peerDependencies.typescript`);
  }

  return range;
}

/**
 * Read every package-level TypeScript peer dependency in the workspace. The
 * weekly smoke matrix uses packages/analysis as the representative source, so
 * this guard prevents the representative range from drifting from other
 * TypeScript peer packages.
 *
 * @param {string} root
 * @returns {TypeScriptPeerDependencyRange[]}
 */
export function readWorkspaceTypeScriptPeerDependencyRanges(root = resolveRepoRoot()) {
  const packagesRoot = path.join(root, "packages");
  /** @type {TypeScriptPeerDependencyRange[]} */
  const ranges = [];

  for (const packageName of readdirSync(packagesRoot).sort()) {
    const packageJsonPath = path.join(packagesRoot, packageName, "package.json");
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = readPackageJsonRecord(packageJsonPath);
    const peerDependencies = packageJson.peerDependencies;
    if (!isStringKeyedRecord(peerDependencies)) {
      continue;
    }

    const range = peerDependencies.typescript;
    if (typeof range === "string") {
      ranges.push({
        packageJsonPath: path.relative(root, packageJsonPath),
        range,
      });
    }
  }

  return ranges;
}

/**
 * Fail when any workspace package declares a different TypeScript peer range
 * than the representative package used to compute Tier-3 rows.
 *
 * @param {string} referenceRange
 * @param {string} root
 * @returns {void}
 */
export function assertWorkspaceTypeScriptPeerDependencyRangesAligned(
  referenceRange,
  root = resolveRepoRoot()
) {
  const ranges = readWorkspaceTypeScriptPeerDependencyRanges(root);
  const divergentRanges = ranges.filter((entry) => entry.range !== referenceRange);

  if (divergentRanges.length > 0) {
    const details = divergentRanges
      .map((entry) => `${entry.packageJsonPath}: ${entry.range}`)
      .join(", ");
    throw new Error(
      `TypeScript peer-dependency ranges must match ${JSON.stringify(referenceRange)}; found ${details}`
    );
  }
}

/**
 * Fetch all published TypeScript package versions from npm. The result is
 * intentionally parsed here rather than inside the workflow YAML so the matrix
 * logic has local unit coverage.
 *
 * @returns {string[]}
 */
export function readPublishedTypeScriptVersions() {
  const output = execFileSync("npm", ["view", "typescript", "versions", "--json"], {
    encoding: "utf8",
  });
  const parsed = /** @type {unknown} */ (JSON.parse(output));

  if (!Array.isArray(parsed) || !parsed.every((version) => typeof version === "string")) {
    throw new Error("npm returned an unexpected TypeScript versions payload");
  }

  return /** @type {string[]} */ (parsed);
}

/**
 * Format the computed rows as a GitHub Actions output assignment. Workflows
 * append this exact string to $GITHUB_OUTPUT.
 *
 * @param {TypeScriptMinorSmokeMatrixRow[]} include
 * @returns {string}
 */
export function formatGitHubOutput(include) {
  return `include=${JSON.stringify(include)}`;
}

const cliPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
const isCliEntry = cliPath === fileURLToPath(import.meta.url);

if (isCliEntry) {
  try {
    const peerDependencyRange = readTypeScriptPeerDependency();
    assertWorkspaceTypeScriptPeerDependencyRangesAligned(peerDependencyRange);
    const versions = readPublishedTypeScriptVersions();
    const include = computeTypeScriptMinorSmokeMatrix({ peerDependencyRange, versions });
    globalThis.console.log(formatGitHubOutput(include));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    globalThis.console.error(`[compute-typescript-minor-smoke-matrix] ${message}`);
    process.exit(1);
  }
}
