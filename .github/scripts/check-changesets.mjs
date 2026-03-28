#!/usr/bin/env node
/**
 * Enforces changeset inclusion for pull requests in the formspec monorepo.
 *
 * Reads the CHANGED_FILES environment variable (newline-separated list of
 * file paths changed in a PR), determines which publishable packages are
 * affected (directly or transitively), and verifies that every affected
 * package is covered by at least one changeset file included in the PR.
 *
 * Exits 0 on success, 1 when changesets are missing.
 * On failure, writes a markdown report to /tmp/changeset-comment.md.
 *
 * Usage:
 *   CHANGED_FILES="packages/core/src/index.ts\n.changeset/my-change.md" \
 *     node .github/scripts/check-changesets.mjs
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads and parses a JSON file. Returns null and logs a warning on any error.
 * @param {string} filePath
 * @returns {Record<string, unknown> | null}
 */
function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[check-changesets] Warning: could not read ${filePath}: ${String(err)}`);
    return null;
  }
}

/**
 * Parses the simple YAML frontmatter used by changeset files.
 *
 * Changeset files are delimited by `---` lines. The frontmatter sits between
 * the first and second `---`. Each line is one of:
 *   "package-name": bump-type
 *   'package-name': bump-type
 *   package-name: bump-type
 *
 * Returns a Set of package names mentioned in the frontmatter.
 * Returns an empty Set and logs a warning if the file cannot be parsed.
 *
 * @param {string} filePath
 * @returns {Set<string>}
 */
function parseChangesetPackages(filePath) {
  const result = new Set();
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.warn(`[check-changesets] Warning: could not read ${filePath}: ${String(err)}`);
    return result;
  }

  // Split on `---` delimiter lines (allowing surrounding whitespace)
  const sections = raw.split(/^---\s*$/m);
  // Structure: sections[0] = content before first `---` (usually empty)
  //            sections[1] = frontmatter
  //            sections[2] = body
  if (sections.length < 3) {
    console.warn(
      `[check-changesets] Warning: ${filePath} does not look like a valid changeset (expected --- delimiters), skipping.`
    );
    return result;
  }

  const frontmatter = sections[1];
  for (const line of frontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match: optional-quote package-name optional-quote : bump-type
    // Handles: "@formspec/core": minor  |  '@formspec/core': patch  |  formspec: major
    const match = /^['"]?([^'":\s][^'":]*?)['"]?\s*:\s*\S+$/.exec(trimmed);
    if (match) {
      result.add(match[1].trim());
    } else {
      console.warn(
        `[check-changesets] Warning: unrecognized frontmatter line in ${filePath}: ${trimmed}`
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 1: Parse changed files
// ---------------------------------------------------------------------------

const changedFilesEnv = process.env["CHANGED_FILES"] ?? "";
const changedFiles = changedFilesEnv
  .split("\n")
  .map((f) => f.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Step 2: Classify changed files
// ---------------------------------------------------------------------------

// Map: package directory name (e.g. "core") → package name (e.g. "@formspec/core")
/** @type {Map<string, string>} */
const dirToName = new Map();

// Packages whose package.json we need to inspect for their name
/** @type {Set<string>} */
const sourceChangedDirs = new Set();

/** @type {string[]} */
const changesetFiles = [];

for (const file of changedFiles) {
  // Check for changeset files: .changeset/*.md (but not README.md)
  if (file.startsWith(".changeset/") && file.endsWith(".md") && !file.endsWith("README.md")) {
    changesetFiles.push(file);
    continue;
  }

  // Treat (almost) anything under packages/<dir>/** as a source change, with a small
  // explicit denylist for docs-only files that should not require a changeset.
  const pkgMatch = /^packages\/([^/]+)\/(.+)$/.exec(file);
  if (pkgMatch) {
    const dirMatch = pkgMatch[1];
    const pkgRelativePath = pkgMatch[2];
    const lower = pkgRelativePath.toLowerCase();

    // Denylist: documentation-only files that should not require a changeset.
    const isDocLike =
      lower === "readme.md" ||
      lower === "readme" ||
      lower === "changelog.md" ||
      lower === "changelog" ||
      lower.startsWith("docs/") ||
      lower.startsWith("documentation/");

    if (!isDocLike) {
      sourceChangedDirs.add(dirMatch);
    }
  }
  // Everything else is ignored (root config, .github/, lockfiles, e2e/, examples/)
}

// Resolve directory names to package names
for (const dir of sourceChangedDirs) {
  const pkgJsonPath = path.join("packages", dir, "package.json");
  const pkgJson = readJsonSafe(pkgJsonPath);
  if (!pkgJson) continue;
  const name = pkgJson["name"];
  if (typeof name === "string" && name) {
    dirToName.set(dir, name);
  }
}

const unresolvedDirs = [...sourceChangedDirs].filter((dir) => !dirToName.has(dir));
if (unresolvedDirs.length > 0) {
  console.error(
    `[check-changesets] Fatal: could not resolve package name for: ${unresolvedDirs.join(", ")}`
  );
  process.exit(1);
}

/** @type {Set<string>} Set of directly-changed package names */
const directlyChanged = new Set(dirToName.values());

// ---------------------------------------------------------------------------
// Step 3: Early exit if no source changes
// ---------------------------------------------------------------------------

if (directlyChanged.size === 0) {
  console.log("[check-changesets] No package source changes detected — no changeset required.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 4: Build reverse dependency graph across all workspace packages
// ---------------------------------------------------------------------------

// Discover all packages in packages/*/
let packageDirs;
try {
  packageDirs = fs.readdirSync("packages");
} catch (err) {
  console.error(`[check-changesets] Fatal: could not read packages/ directory: ${String(err)}`);
  process.exit(1);
}

/**
 * Full package metadata indexed by package name.
 * @type {Map<string, { name: string; private: boolean; internalDeps: string[] }>}
 */
const allPackages = new Map();

for (const dir of packageDirs) {
  const pkgJsonPath = path.join("packages", dir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) continue;

  const pkgJson = readJsonSafe(pkgJsonPath);
  if (!pkgJson) continue;

  const name = pkgJson["name"];
  if (typeof name !== "string" || !name) continue;

  // Collect declared runtime-relevant dependencies for later graph construction.
  // We intentionally exclude devDependencies so that test-only links between
  // workspace packages do not force downstream changesets.
  const allDeclaredDeps = [
    ...Object.keys(/** @type {Record<string, string>} */ (pkgJson["dependencies"] ?? {})),
    ...Object.keys(/** @type {Record<string, string>} */ (pkgJson["peerDependencies"] ?? {})),
    ...Object.keys(/** @type {Record<string, string>} */ (pkgJson["optionalDependencies"] ?? {})),
  ];

  allPackages.set(name, {
    name,
    private: pkgJson["private"] === true,
    internalDeps: allDeclaredDeps,
  });
}

// Note: Only packages under `packages/` are discovered here. Any e2e or
// examples projects that exist are not included in this metadata and are
// therefore outside the scope of this script's package classification.

/** Set of all known internal package names (for filtering dep keys) */
const allPackageNames = new Set(allPackages.keys());

// Filter each package's dep list to only internal workspace packages now that
// we know the complete set.
for (const meta of allPackages.values()) {
  meta.internalDeps = meta.internalDeps.filter((d) => allPackageNames.has(d));
}

/**
 * Reverse dependency graph: depName → Set<packages that depend on depName>
 * @type {Map<string, Set<string>>}
 */
const reverseDeps = new Map();

for (const [name] of allPackages) {
  reverseDeps.set(name, new Set());
}

for (const [name, meta] of allPackages) {
  for (const depName of meta.internalDeps) {
    // `name` depends on `depName`, so `depName`'s reverse map gains `name`
    const existing = reverseDeps.get(depName);
    if (existing) {
      existing.add(name);
    } else {
      reverseDeps.set(depName, new Set([name]));
    }
  }
}

// ---------------------------------------------------------------------------
// Step 5: BFS to compute affected set (transitive closure)
// ---------------------------------------------------------------------------

/**
 * Tracks which packages are affected and the dep path that caused each one.
 * path is the human-readable chain, e.g. "@formspec/core → @formspec/dsl"
 * @type {Map<string, { path: string[] }>}
 */
const affected = new Map();

// Seed BFS with directly-changed packages (path = just themselves)
/** @type {Array<{ name: string; path: string[] }>} */
const queue = [];

for (const name of directlyChanged) {
  affected.set(name, { path: [name] });
  queue.push({ name, path: [name] });
}

let head = 0;
while (head < queue.length) {
  const current = queue[head++];
  const dependents = reverseDeps.get(current.name) ?? new Set();

  for (const dependent of dependents) {
    if (!affected.has(dependent)) {
      const newPath = [...current.path, dependent];
      affected.set(dependent, { path: newPath });
      queue.push({ name: dependent, path: newPath });
    }
  }
}

// ---------------------------------------------------------------------------
// Step 6: Filter out private packages
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const affectedPublishable = new Set();

for (const [name] of affected) {
  const meta = allPackages.get(name);
  if (!meta) {
    // Package not found in packages/* — skip (e.g., e2e, examples)
    continue;
  }
  if (!meta.private) {
    affectedPublishable.add(name);
  }
}

// ---------------------------------------------------------------------------
// Step 7: Parse changeset files from the changed files list
// ---------------------------------------------------------------------------

/** @type {Set<string>} Union of all package names mentioned in changesets */
const coveredByChangesets = new Set();

for (const csFile of changesetFiles) {
  const packages = parseChangesetPackages(csFile);
  for (const pkg of packages) {
    coveredByChangesets.add(pkg);
  }
}

// ---------------------------------------------------------------------------
// Step 8: Compare
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const missing = new Set();
for (const name of affectedPublishable) {
  if (!coveredByChangesets.has(name)) {
    missing.add(name);
  }
}

// ---------------------------------------------------------------------------
// Step 9: Exit 0 on success
// ---------------------------------------------------------------------------

if (missing.size === 0) {
  console.log(
    `[check-changesets] All ${affectedPublishable.size} affected publishable package(s) are covered by changesets.`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 10: Build and write failure report
// ---------------------------------------------------------------------------

/** @param {string} name */
function isDirectlyChanged(name) {
  return directlyChanged.has(name);
}

/** @param {string} name */
function getDepPath(name) {
  return affected.get(name)?.path ?? [name];
}

// Partition missing into directly-changed and downstream
const missingDirect = [...missing].filter((n) => isDirectlyChanged(n)).sort();
const missingDownstream = [...missing].filter((n) => !isDirectlyChanged(n)).sort();

// Build human-readable dep paths for downstream packages
// The stored path includes the package itself at the end; format the
// intermediate deps as a chain without repeating the final package name.
/** @param {string} name */
function formatDepChain(name) {
  const fullPath = getDepPath(name);
  // fullPath: ["@formspec/core", "@formspec/dsl", "@formspec/build"]
  // We want: "@formspec/build (depends on @formspec/core → @formspec/dsl)"
  if (fullPath.length <= 1) return name;
  const ancestors = fullPath.slice(0, -1);
  return `\`${name}\` (depends on ${ancestors.map((p) => `\`${p}\``).join(" → ")})`;
}

const missingList = [...missing]
  .sort()
  .map((n) => `- \`${n}\``)
  .join("\n");

let reportSections = "## Changeset Required\n\n";
reportSections +=
  "The following packages are affected by this PR but are not mentioned in any changeset:\n";

if (missingDirect.length > 0) {
  reportSections += "\n### Directly changed\n";
  reportSections += missingDirect.map((n) => `- \`${n}\``).join("\n") + "\n";
}

if (missingDownstream.length > 0) {
  reportSections += "\n### Affected downstream\n";
  reportSections += missingDownstream.map((n) => `- ${formatDepChain(n)}`).join("\n") + "\n";
}

reportSections += "\n### Missing changeset entries\n";
reportSections += missingList + "\n";

reportSections += `
### How to fix
Run \`pnpm changeset\` and select the affected packages, or add a \`.changeset/*.md\` file manually.
`;

const reportPath = "/tmp/changeset-comment.md";
try {
  fs.writeFileSync(reportPath, reportSections, "utf8");
  console.log(`[check-changesets] Report written to ${reportPath}`);
} catch (err) {
  console.error(
    `[check-changesets] Warning: could not write report to ${reportPath}: ${String(err)}`
  );
}

// Log summary to stdout
console.error(
  `[check-changesets] ERROR: ${missing.size} package(s) are affected but have no changeset entry:`
);
for (const name of [...missing].sort()) {
  const depPath = getDepPath(name);
  if (depPath.length > 1) {
    console.error(`  - ${name} (via ${depPath.slice(0, -1).join(" → ")})`);
  } else {
    console.error(`  - ${name} (directly changed)`);
  }
}
console.error(
  `\nRun \`pnpm changeset\` to add a changeset, or add a .changeset/*.md file manually.`
);

process.exit(1);
