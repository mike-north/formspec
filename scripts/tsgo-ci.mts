#!/usr/bin/env tsx
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCOPED_TSGO_INCLUDE = ["packages/*/src/**/*", "packages/*/tests/**/*"];
const SCOPED_TSGO_EXCLUDE = ["packages/*/tests/**/*.test-d.ts"];
const TSGO_BASE_ARGS = ["exec", "tsgo", "--noEmit"] as const;
const PACKAGE_TSGO_ARGS = TSGO_BASE_ARGS;
const E2E_TSGO_ARGS = [...TSGO_BASE_ARGS, "-p", "e2e/tsconfig.tsgo.json"] as const;
const TYPE_SCRIPT_SERVER_SUBPATHS = ["tsserver.js", "tsserverlibrary.d.ts", "tsserverlibrary.js"];
const TYPE_SCRIPT_DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type TypeScriptModule = typeof import("typescript");

export interface TypeScriptAliasResolution {
  workspaceRoot: string;
  packageName: string;
  version: string;
}

export interface CommandResult {
  status: number | null;
  signal?: string | null;
  error?: Error;
}

type TsgoCommandRunner = (args: readonly string[]) => CommandResult;

function resolveFromRepoRoot(repoRoot: string, ...segments: string[]): string {
  return path.resolve(repoRoot, ...segments);
}

function createRequireFromRepoRoot(repoRoot: string): NodeJS.Require {
  return createRequire(resolveFromRepoRoot(repoRoot, "package.json"));
}

function isStringKeyedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!isStringKeyedRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }

  return parsed;
}

function discoverChildPackageRoots(repoRoot: string, directory: string): string[] {
  const packagesRoot = resolveFromRepoRoot(repoRoot, directory);
  if (!existsSync(packagesRoot)) {
    return [];
  }

  return readdirSync(packagesRoot, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      existsSync(resolveFromRepoRoot(repoRoot, directory, entry.name, "package.json"))
    )
    .map((entry) => path.posix.join(directory, entry.name));
}

function discoverWorkspacePackageRoots(repoRoot: string): string[] {
  return [
    ...discoverChildPackageRoots(repoRoot, "packages"),
    ...discoverChildPackageRoots(repoRoot, "examples"),
    ...(existsSync(resolveFromRepoRoot(repoRoot, "e2e/package.json")) ? ["e2e"] : []),
  ];
}

function declaresTypeScriptDependency(packageJson: Record<string, unknown>): boolean {
  return TYPE_SCRIPT_DEPENDENCY_SECTIONS.some((sectionName) => {
    const section = packageJson[sectionName];
    return isStringKeyedRecord(section) && typeof section["typescript"] === "string";
  });
}

export function discoverTypeScriptApiWorkspaceRoots({
  repoRoot = process.cwd(),
}: {
  repoRoot?: string;
} = {}): string[] {
  return [".", ...discoverWorkspacePackageRoots(repoRoot)].filter((workspaceRoot) => {
    const packageJsonPath = resolveFromRepoRoot(repoRoot, workspaceRoot, "package.json");
    return (
      existsSync(packageJsonPath) && declaresTypeScriptDependency(readJsonRecord(packageJsonPath))
    );
  });
}

function discoverTypeScriptBinDirectories(repoRoot: string, packageRoots: string[]): string[] {
  return [
    resolveFromRepoRoot(repoRoot, "node_modules/.bin"),
    ...packageRoots.map((packageRoot) =>
      resolveFromRepoRoot(repoRoot, packageRoot, "node_modules/.bin")
    ),
    resolveFromRepoRoot(repoRoot, "e2e/node_modules/.bin"),
  ].filter((binDirectory) => existsSync(binDirectory));
}

function loadTypeScriptFromRepoRoot(repoRoot: string): TypeScriptModule {
  return createRequireFromRepoRoot(repoRoot)("typescript") as TypeScriptModule;
}

function formatDiagnosticsHost(): Parameters<
  TypeScriptModule["formatDiagnosticsWithColorAndContext"]
>[1] {
  return {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  };
}

export function prepareTypeScript6Compatibility({
  repoRoot = process.cwd(),
  packageRoots = discoverWorkspacePackageRoots(repoRoot),
}: {
  repoRoot?: string;
  packageRoots?: string[];
} = {}): void {
  const rootTsc6 = resolveFromRepoRoot(repoRoot, "node_modules/.bin/tsc6");
  const launcher = `#!/usr/bin/env sh\nexec ${JSON.stringify(rootTsc6)} "$@"\n`;

  for (const binDirectory of discoverTypeScriptBinDirectories(repoRoot, packageRoots)) {
    const launcherPath = path.join(binDirectory, "tsc");
    writeFileSync(launcherPath, launcher, { mode: 0o755 });
    chmodSync(launcherPath, 0o755);
  }

  bridgeTypeScriptServerSubpaths(repoRoot);
}

const REAL_TYPESCRIPT_ALIAS_TARGET_PREFIX = "npm:typescript@";

// @typescript/typescript6 declares its real-TypeScript dependency under an
// alias key (e.g. "@typescript/old": "npm:typescript@^6") rather than a
// literal "typescript" key, and that key has already changed once upstream
// (was "typescript" through 6.0.0, became "@typescript/old" as of 6.0.1 —
// see #576). Discover the current key from the shim's own manifest instead
// of hardcoding it, so a future rename doesn't silently produce a dangling
// symlink here.
function resolveRealTypeScriptDependencyName(aliasPackageJsonPath: string): string {
  const aliasPackageJson = readJsonRecord(aliasPackageJsonPath);
  const dependencies = aliasPackageJson["dependencies"];
  if (!isStringKeyedRecord(dependencies)) {
    throw new Error(`${aliasPackageJsonPath} has no "dependencies" field`);
  }

  // Pre-6.0.1 releases of @typescript/typescript6 depended on the real
  // package under its own name; keep resolving that shape too in case it
  // ever reverts.
  if (typeof dependencies["typescript"] === "string") {
    return "typescript";
  }

  const aliasedEntry = Object.entries(dependencies).find(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].startsWith(REAL_TYPESCRIPT_ALIAS_TARGET_PREFIX)
  );

  if (aliasedEntry === undefined) {
    throw new Error(
      `${aliasPackageJsonPath} does not declare a dependency aliased to the real "typescript" ` +
        `package (expected an "npm:typescript@..." value). The TS 6 compatibility shim's internal ` +
        "dependency name may have changed upstream again — see #449."
    );
  }

  return aliasedEntry[0];
}

function bridgeTypeScriptServerSubpaths(repoRoot: string): void {
  const requireFromRepo = createRequireFromRepoRoot(repoRoot);
  const aliasPackageJson = requireFromRepo.resolve("typescript/package.json");
  const requireFromAlias = createRequire(aliasPackageJson);
  const aliasLib = path.join(path.dirname(aliasPackageJson), "lib");
  const realTypeScriptDependencyName = resolveRealTypeScriptDependencyName(aliasPackageJson);
  const realTypescriptLib = path.dirname(
    requireFromAlias.resolve(`${realTypeScriptDependencyName}/lib/typescript.js`)
  );

  mkdirSync(aliasLib, { recursive: true });

  for (const fileName of TYPE_SCRIPT_SERVER_SUBPATHS) {
    const target = path.join(aliasLib, fileName);
    // Use lstatSync rather than existsSync: existsSync follows symlinks and
    // reports a broken symlink as "does not exist", which would leave a
    // stale/dangling link in place (as happened when the alias's dependency
    // name changed upstream — see #576) instead of repairing it.
    if (pathEntryExists(target)) {
      unlinkSync(target);
    }
    symlinkSync(path.join(realTypescriptLib, fileName), target);
  }
}

function pathEntryExists(candidatePath: string): boolean {
  try {
    lstatSync(candidatePath);
    return true;
  } catch {
    return false;
  }
}

export function assertTypeScript6AliasResolution({
  repoRoot = process.cwd(),
  workspaceRoots = discoverTypeScriptApiWorkspaceRoots({ repoRoot }),
}: {
  repoRoot?: string;
  workspaceRoots?: string[];
} = {}): TypeScriptAliasResolution[] {
  return workspaceRoots.map((workspaceRoot) => {
    const requireFromWorkspace = createRequire(
      resolveFromRepoRoot(repoRoot, workspaceRoot, "package.json")
    );
    const packageJson = requireFromWorkspace("typescript/package.json") as {
      name?: unknown;
      version?: unknown;
    };
    const packageName = String(packageJson.name);
    const version = String(packageJson.version);

    if (packageName !== "@typescript/typescript6") {
      throw new Error(
        `${workspaceRoot} resolved ${packageName}@${version}, expected @typescript/typescript6`
      );
    }

    return { workspaceRoot, packageName, version };
  });
}

export function writeScopedTsgoRootConfig({
  repoRoot = process.cwd(),
  typescript = loadTypeScriptFromRepoRoot(repoRoot),
}: {
  repoRoot?: string;
  typescript?: TypeScriptModule;
} = {}): void {
  const fileName = resolveFromRepoRoot(repoRoot, "tsconfig.json");
  const parsed = typescript.parseConfigFileTextToJson(fileName, readFileSync(fileName, "utf8"));

  if (parsed.error !== undefined) {
    throw new Error(
      typescript.formatDiagnosticsWithColorAndContext([parsed.error], formatDiagnosticsHost())
    );
  }

  if (typeof parsed.config !== "object" || parsed.config === null || Array.isArray(parsed.config)) {
    throw new Error(`${fileName} must contain a JSON object`);
  }

  const config = parsed.config as Record<string, unknown>;
  config.include = SCOPED_TSGO_INCLUDE;
  config.exclude = SCOPED_TSGO_EXCLUDE;

  writeFileSync(fileName, `${JSON.stringify(config, null, 2)}\n`);
}

function assertSuccessfulCommandResult(result: CommandResult, label: string): void {
  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.signal !== undefined && result.signal !== null) {
    throw new Error(`${label} terminated by signal ${result.signal}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit status ${String(result.status)}`);
  }
}

export function runTsgoTypecheck({
  repoRoot = process.cwd(),
  typescript = loadTypeScriptFromRepoRoot(repoRoot),
  runCommand = (args) =>
    spawnSync("pnpm", [...args], {
      cwd: repoRoot,
      stdio: "inherit",
    }) as SpawnSyncReturns<Buffer>,
}: {
  repoRoot?: string;
  typescript?: TypeScriptModule;
  runCommand?: TsgoCommandRunner;
} = {}): CommandResult {
  const fileName = resolveFromRepoRoot(repoRoot, "tsconfig.json");
  const originalConfig = readFileSync(fileName, "utf8");

  try {
    writeScopedTsgoRootConfig({ repoRoot, typescript });
    assertSuccessfulCommandResult(runCommand(PACKAGE_TSGO_ARGS), "package tsgo typecheck");
  } finally {
    writeFileSync(fileName, originalConfig);
  }

  const e2eResult = runCommand(E2E_TSGO_ARGS);
  assertSuccessfulCommandResult(e2eResult, "e2e tsgo typecheck");
  return e2eResult;
}

function printAliasResolution(): void {
  for (const result of assertTypeScript6AliasResolution()) {
    console.log(`${result.workspaceRoot}: ${result.packageName}@${result.version}`);
  }
}

function printUsage(): void {
  console.error("Usage: tsx scripts/tsgo-ci.mts <prepare-compat|assert-alias|typecheck>");
}

function main(): void {
  const command = process.argv[2];

  switch (command) {
    case "prepare-compat":
      prepareTypeScript6Compatibility();
      break;
    case "assert-alias":
      printAliasResolution();
      break;
    case "typecheck":
      runTsgoTypecheck();
      break;
    default:
      printUsage();
      process.exitCode = 2;
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  }
}
