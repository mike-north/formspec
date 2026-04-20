import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
// Lazy import — jiti is Node-only and must not be statically analyzed
// by browser bundlers (e.g., the playground's Vite build).
async function getJiti() {
  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url);
}
import type { LoggerLike } from "@formspec/core";
import { noopLogger } from "@formspec/core";
import type { FormSpecConfig, ConstraintConfig, ResolvedConstraintConfig } from "./types.js";
import { mergeWithDefaults } from "./defaults.js";

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
   * Defaults to process.cwd().
   */
  searchFrom?: string;

  /**
   * Explicit path to a config file.
   * If provided, skips file discovery entirely.
   */
  configPath?: string;

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
 * Checks if a directory is a workspace root by looking for a package.json
 * with a "workspaces" field.
 */
async function isWorkspaceRoot(dir: string): Promise<boolean> {
  const pkgPath = resolve(dir, "package.json");
  try {
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as Record<string, unknown>;
    return "workspaces" in pkg;
  } catch {
    return false;
  }
}

/**
 * Walks up the directory tree from startDir, searching for a config file.
 * Stops at the filesystem root or a directory containing a workspace root package.json.
 */
async function findConfigFile(startDir: string): Promise<string | null> {
  let currentDir = resolve(startDir);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with explicit break conditions
  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = resolve(currentDir, fileName);
      try {
        await readFile(filePath);
        return filePath;
      } catch {
        // File doesn't exist, try next name
      }
    }

    // Stop at workspace root — don't cross workspace boundaries
    if (await isWorkspaceRoot(currentDir)) {
      break;
    }

    const parentDir = dirname(currentDir);
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
    (typeof config.vendorPrefix !== "string" || !config.vendorPrefix.startsWith("x-"))
  ) {
    throw new Error(
      `Invalid config at ${filePath}: "vendorPrefix" must be a string starting with "x-", got ${JSON.stringify(config.vendorPrefix)}`
    );
  }
  validateEnumSerializationValue(config.enumSerialization, "enumSerialization", filePath);
  validatePackageOverrides(config.packages, filePath);
}

function validatePackageOverrides(
  packages: unknown,
  filePath: string
): void {
  if (packages === undefined) {
    return;
  }
  if (!isConfigOverrideRecord(packages)) {
    throw new Error(
      `Invalid config at ${filePath}: "packages" must be an object mapping glob patterns to override objects, got ${JSON.stringify(packages)}`
    );
  }

  for (const [pattern, override] of Object.entries(packages)) {
    // Reject null/array/non-object overrides here so later nested validation reports a clear config error.
    if (!isConfigOverrideRecord(override)) {
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

function isConfigOverrideRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEnumSerializationValue(
  value: unknown,
  label: string,
  filePath: string
): void {
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
 * the filesystem root or a workspace root (a directory with a package.json
 * containing a "workspaces" field).
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
  const { searchFrom = process.cwd(), configPath, logger: rawLogger } = options;
  const logger = (rawLogger ?? noopLogger).child({ stage: "config" });

  let resolvedPath: string | null = null;

  if (configPath) {
    resolvedPath = resolve(configPath);
    try {
      await readFile(resolvedPath);
    } catch {
      throw new Error(`Config file not found at ${resolvedPath}`);
    }
  } else {
    resolvedPath = await findConfigFile(searchFrom);
  }

  if (!resolvedPath) {
    logger.debug("no config file found", { searchFrom });
    return { found: false };
  }

  logger.debug("loading config file", { configPath: resolvedPath, source: configPath ? "explicit" : "discovered" });
  const config = await loadConfigFile(resolvedPath);

  return {
    config,
    configPath: resolvedPath,
    found: true,
  };
}

/**
 * Loads FormSpec constraint configuration from a config file.
 * Returns the resolved constraints with defaults applied.
 *
 * @deprecated Use `loadFormSpecConfig` instead, which returns the full `FormSpecConfig`.
 *
 * @param options - Options for loading configuration
 * @returns The loaded configuration with defaults applied
 *
 * @public
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<{
  config: ResolvedConstraintConfig;
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
 * Creates a constraint configuration directly from an object.
 * Useful for programmatic configuration without a config file.
 *
 * @param config - Partial constraint configuration
 * @returns Complete configuration with defaults applied
 *
 * @example
 * ```ts
 * const config = defineConstraints({
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
export function defineConstraints(config: ConstraintConfig): ResolvedConstraintConfig {
  return mergeWithDefaults(config);
}
