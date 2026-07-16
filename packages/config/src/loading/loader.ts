// Lazy import — jiti is Node-only and must not be statically analyzed
// by browser bundlers (e.g., the playground's Vite build).
async function getJiti() {
  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url);
}
import type { LoggerLike } from "@formspec/core";
import { noopLogger } from "@formspec/core";
import type { DSLPolicy, FormSpecConfig, ResolvedDSLPolicy } from "../application/types.js";
import { defineDSLPolicy, mergeWithDefaults } from "../application/defaults.js";
import { nodeFileSystem, type FileSystem } from "./file-system.js";

// Allows multi-segment prefixes conventional in the OpenAPI/JSON-Schema
// world (`x-acme-corp`, `x-stripe-billing`) — see docs/007-configuration.md
// §3.4 and docs/000-principles.md PP10.
const VENDOR_PREFIX_PATTERN = /^x-[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Config file names to search for, in priority order.
 */
const CONFIG_FILE_NAMES = [
  "formspec.config.ts",
  "formspec.config.mts",
  "formspec.config.js",
  "formspec.config.mjs",
];

/**
 * Options for loading configuration.
 *
 * @public
 */
export interface LoadConfigOptions {
  /**
   * The directory to start searching from.
   * Defaults to `"."`, resolved by the active filesystem adapter.
   */
  searchFrom?: string;

  /**
   * Explicit path to a config file.
   * If provided, skips file discovery entirely.
   */
  configPath?: string;

  /**
   * Optional filesystem adapter for config discovery, existence checks, and
   * workspace-root file reads.
   * Non-Node environments must provide one. When omitted, FormSpec lazily
   * loads the default Node adapter at call time.
   */
  fileSystem?: FileSystem;

  /**
   * Optional logger for diagnostic output. Defaults to a no-op logger so
   * existing callers produce no output.
   */
  logger?: LoggerLike | undefined;
}

/**
 * Result when a config file was found and loaded.
 *
 * @public
 */
export interface LoadConfigFoundResult {
  /** The loaded configuration */
  config: FormSpecConfig;
  /** The absolute path to the config file that was loaded */
  configPath: string;
  /** Whether a config file was found */
  found: true;
}

/**
 * Result when no config file was found.
 *
 * @public
 */
export interface LoadConfigNotFoundResult {
  /** Whether a config file was found */
  found: false;
}

/**
 * Result of loading configuration.
 *
 * @public
 */
export type LoadConfigResult = LoadConfigFoundResult | LoadConfigNotFoundResult;

/**
 * Filenames whose presence in a directory marks it as a monorepo
 * workspace-root boundary, beyond the npm/yarn `package.json#workspaces`
 * field handled separately by {@link hasWorkspacesField}.
 *
 * See docs/007-configuration.md §5.3 for the documented discovery algorithm.
 */
const WORKSPACE_BOUNDARY_FILES = ["pnpm-workspace.yaml", "lerna.json", "rush.json"];

/**
 * Checks if a directory has a package.json with a "workspaces" field
 * (npm/yarn workspace root).
 */
async function hasWorkspacesField(fileSystem: FileSystem, dir: string): Promise<boolean> {
  const pkgPath = fileSystem.resolve(dir, "package.json");
  try {
    const content = await fileSystem.readFile(pkgPath);
    const pkg = JSON.parse(content) as Record<string, unknown>;
    return "workspaces" in pkg;
  } catch {
    return false;
  }
}

/**
 * Checks if a directory is a monorepo/workspace-root boundary that config
 * discovery must not climb past. A directory qualifies if it contains any
 * of:
 * - `package.json` with a `"workspaces"` field (npm/yarn)
 * - `pnpm-workspace.yaml` (pnpm)
 * - `lerna.json` (Lerna)
 * - `rush.json` (Rush)
 * - `.git` (repository root) — a directory in a normal checkout, or a file
 *   pointing at the real git dir in a worktree/submodule. `FileSystem` only
 *   exposes a file-existence check, so both shapes are probed: `.git` as a
 *   file directly (worktree/submodule), or `.git/HEAD` as a file (normal
 *   checkout, where `.git` itself is a directory).
 */
async function isMonorepoRoot(fileSystem: FileSystem, dir: string): Promise<boolean> {
  if (await hasWorkspacesField(fileSystem, dir)) {
    return true;
  }

  for (const fileName of WORKSPACE_BOUNDARY_FILES) {
    if (await fileSystem.exists(fileSystem.resolve(dir, fileName))) {
      return true;
    }
  }

  if (await fileSystem.exists(fileSystem.resolve(dir, ".git"))) {
    return true;
  }
  if (await fileSystem.exists(fileSystem.resolve(dir, ".git", "HEAD"))) {
    return true;
  }

  return false;
}

/**
 * Walks up the directory tree from startDir, searching for a config file.
 * Stops at the filesystem root or a monorepo/workspace-root boundary (see
 * {@link isMonorepoRoot}).
 */
async function findConfigFile(fileSystem: FileSystem, startDir: string): Promise<string | null> {
  let currentDir = fileSystem.resolve(startDir);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with explicit break conditions
  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = fileSystem.resolve(currentDir, fileName);
      if (await fileSystem.exists(filePath)) {
        return filePath;
      }
    }

    // Stop at a monorepo/workspace root — don't cross workspace boundaries
    if (await isMonorepoRoot(fileSystem, currentDir)) {
      break;
    }

    const parentDir = fileSystem.dirname(currentDir);
    // Reached filesystem root when dirname returns same path
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Loads and validates a TypeScript/JavaScript config file using jiti.
 * The file must have a default export of a FormSpecConfig object.
 */
async function loadConfigFile(filePath: string): Promise<FormSpecConfig> {
  const jiti = await getJiti();
  const mod = await jiti.import(filePath);

  const defaultExport = (mod as { default?: unknown }).default ?? mod;

  if (defaultExport === null || defaultExport === undefined) {
    return {};
  }

  if (typeof defaultExport !== "object" || Array.isArray(defaultExport)) {
    throw new Error(
      `Invalid config file at ${filePath}: default export must be a FormSpecConfig object, got ${Array.isArray(defaultExport) ? "array" : typeof defaultExport}`
    );
  }

  const config = defaultExport as FormSpecConfig;
  validateLoadedConfig(config, filePath);
  return config;
}

/**
 * Validates known fields of a loaded config for structural correctness.
 * Catches common misconfiguration with clear error messages.
 */
function validateLoadedConfig(config: FormSpecConfig, filePath: string): void {
  if (config.extensions !== undefined && !Array.isArray(config.extensions)) {
    throw new Error(
      `Invalid config at ${filePath}: "extensions" must be an array, got ${typeof config.extensions}`
    );
  }
  if (
    config.vendorPrefix !== undefined &&
    (typeof config.vendorPrefix !== "string" || !VENDOR_PREFIX_PATTERN.test(config.vendorPrefix))
  ) {
    throw new Error(
      `Invalid config at ${filePath}: "vendorPrefix" must match /^x-[a-z0-9]+(-[a-z0-9]+)*$/, got ${JSON.stringify(config.vendorPrefix)}`
    );
  }
  validateEnumSerializationValue(config.enumSerialization, "enumSerialization", filePath);
  validateSerializationConfig(config.serialization, "serialization", filePath);
  validatePackageOverrides(config.packages, filePath);
}

function validateSerializationConfig(value: unknown, label: string, filePath: string): void {
  if (value === undefined) {
    return;
  }
  if (!isStringKeyedRecord(value)) {
    throw new Error(
      `Invalid config at ${filePath}: "${label}" must be an object, got ${JSON.stringify(value)}`
    );
  }

  validateOptionalString(value["vocabularyBaseUrl"], `${label}.vocabularyBaseUrl`, filePath);
  validateOptionalString(value["dialectUrl"], `${label}.dialectUrl`, filePath);

  const vocabularyUrls = value["vocabularyUrls"];
  if (vocabularyUrls !== undefined && !isStringRecordOfStrings(vocabularyUrls)) {
    throw new Error(
      `Invalid config at ${filePath}: "${label}.vocabularyUrls" must be an object mapping vocabulary identifiers to URLs, got ${JSON.stringify(vocabularyUrls)}`
    );
  }
}

function validatePackageOverrides(packages: unknown, filePath: string): void {
  if (packages === undefined) {
    return;
  }
  if (!isStringKeyedRecord(packages)) {
    throw new Error(
      `Invalid config at ${filePath}: "packages" must be an object mapping glob patterns to override objects, got ${JSON.stringify(packages)}`
    );
  }

  for (const [pattern, override] of Object.entries(packages)) {
    // Fail fast with a precise pointer rather than letting a later property access
    // throw a raw `TypeError` against a non-object override value.
    if (!isStringKeyedRecord(override)) {
      throw new Error(
        `Invalid config at ${filePath}: "packages[${JSON.stringify(pattern)}]" must be an override object, got ${JSON.stringify(override)}`
      );
    }
    validateEnumSerializationValue(
      override["enumSerialization"],
      `packages[${JSON.stringify(pattern)}].enumSerialization`,
      filePath
    );
  }
}

function validateOptionalString(value: unknown, label: string, filePath: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(
      `Invalid config at ${filePath}: "${label}" must be a string, got ${JSON.stringify(value)}`
    );
  }
}

function isStringRecordOfStrings(value: unknown): value is Record<string, string> {
  if (!isStringKeyedRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * Full plain-object guard. Rejects arrays, wrapped primitives
 * (`Object(10n)`), class instances (`new Map()`, `new Date()`), and
 * symbol-keyed objects — shapes that would otherwise slip past a naive
 * `typeof === "object"` check and silently defeat validation.
 */
function isStringKeyedRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  return true;
}

function validateEnumSerializationValue(value: unknown, label: string, filePath: string): void {
  if (value !== undefined && value !== "enum" && value !== "oneOf" && value !== "smart-size") {
    throw new Error(
      `Invalid config at ${filePath}: "${label}" must be "enum", "oneOf", or "smart-size", got ${JSON.stringify(value)}`
    );
  }
}

/**
 * Loads FormSpec configuration from a TypeScript config file.
 *
 * Searches for `formspec.config.ts` (and `.mts`, `.js`, `.mjs` variants)
 * starting from `searchFrom` and walking up the directory tree. Stops at
 * the filesystem root or a monorepo/workspace-root boundary — a directory
 * containing a `package.json` with a `"workspaces"` field (npm/yarn),
 * `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, or `.git`.
 *
 * @param options - Options for loading configuration
 * @returns The loaded configuration, or `{ found: false }` if no config file exists
 *
 * @example
 * ```ts
 * // Discover config from current directory
 * const result = await loadFormSpecConfig();
 * if (result.found) {
 *   console.log(result.config, result.configPath);
 * }
 *
 * // Discover config from a specific directory
 * const result = await loadFormSpecConfig({ searchFrom: '/path/to/project' });
 *
 * // Load a specific config file
 * const result = await loadFormSpecConfig({ configPath: '/path/to/formspec.config.ts' });
 * ```
 *
 * @public
 */
export async function loadFormSpecConfig(
  options: LoadConfigOptions = {}
): Promise<LoadConfigResult> {
  const { searchFrom, configPath, logger: rawLogger, fileSystem: rawFileSystem } = options;
  const fileSystem = rawFileSystem ?? (await nodeFileSystem());
  const logger = (rawLogger ?? noopLogger).child({ stage: "config" });

  let resolvedPath: string | null = null;

  if (configPath) {
    resolvedPath = fileSystem.resolve(configPath);
    if (!(await fileSystem.exists(resolvedPath))) {
      throw new Error(`Config file not found at ${resolvedPath}`);
    }
  } else {
    resolvedPath = await findConfigFile(fileSystem, searchFrom ?? ".");
  }

  if (!resolvedPath) {
    logger.debug("no config file found", { searchFrom: searchFrom ?? "." });
    return { found: false };
  }

  logger.debug("loading config file", {
    configPath: resolvedPath,
    source: configPath ? "explicit" : "discovered",
  });
  const config = await loadConfigFile(resolvedPath);

  return {
    config,
    configPath: resolvedPath,
    found: true,
  };
}

/**
 * Loads FormSpec DSL-policy configuration from a config file.
 * Returns the resolved policy with defaults applied.
 *
 * @deprecated Use `loadFormSpecConfig` instead, which returns the full `FormSpecConfig`.
 *
 * @param options - Options for loading configuration
 * @returns The loaded configuration with defaults applied
 *
 * @public
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<{
  config: ResolvedDSLPolicy;
  configPath: string | null;
  found: boolean;
}> {
  // Pass the logger through to the underlying implementation
  const result = await loadFormSpecConfig(options);

  if (!result.found) {
    return {
      config: mergeWithDefaults(undefined),
      configPath: null,
      found: false,
    };
  }

  return {
    config: mergeWithDefaults(result.config.constraints),
    configPath: result.configPath,
    found: true,
  };
}

/**
 * Creates a DSL policy directly from an object.
 * Useful for programmatic configuration without a config file.
 *
 * @param config - Partial DSL-policy configuration
 * @returns Complete configuration with defaults applied
 *
 * @example
 * ```ts
 * const config = defineDSLPolicy({
 *   fieldTypes: {
 *     dynamicEnum: 'error',
 *     dynamicSchema: 'error',
 *   },
 *   layout: {
 *     group: 'error',
 *   },
 * });
 * ```
 *
 * @public
 */
export { defineDSLPolicy };

/**
 * Creates a DSL policy directly from an object.
 *
 * @deprecated Use `defineDSLPolicy`.
 * @public
 */
export const defineConstraints = defineDSLPolicy satisfies (config: DSLPolicy) => ResolvedDSLPolicy;
