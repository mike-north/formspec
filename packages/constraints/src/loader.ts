import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { FormSpecConfig, ConstraintConfig, ResolvedConstraintConfig } from "./types.js";
import { mergeWithDefaults } from "./defaults.js";

/**
 * Default config file names to search for (in order of priority).
 */
const CONFIG_FILE_NAMES = [".formspec.yml", ".formspec.yaml", "formspec.yml"];

/**
 * Options for loading configuration.
 */
export interface LoadConfigOptions {
  /**
   * The directory to search for config files.
   * Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Explicit path to a config file.
   * If provided, skips searching for default config file names.
   */
  configPath?: string;

  /**
   * Whether to search parent directories for config files.
   * Defaults to true.
   */
  searchParents?: boolean;
}

/**
 * Result of loading configuration.
 */
export interface LoadConfigResult {
  /** The loaded and merged configuration */
  config: ResolvedConstraintConfig;
  /** The path to the config file that was loaded (if any) */
  configPath: string | null;
  /** Whether a config file was found */
  found: boolean;
}

/**
 * Searches for a config file in the given directory and optionally parent directories.
 */
async function findConfigFile(
  startDir: string,
  searchParents: boolean
): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = dirname(currentDir);

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = resolve(currentDir, fileName);
      try {
        await readFile(filePath);
        return filePath;
      } catch {
        // File doesn't exist, continue searching
      }
    }

    if (!searchParents || currentDir === root) {
      break;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Parses a YAML config file and returns the FormSpecConfig.
 */
async function parseConfigFile(filePath: string): Promise<FormSpecConfig> {
  const content = await readFile(filePath, "utf-8");
  const parsed = parseYaml(content) as unknown;

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Invalid config file at ${filePath}: expected an object, got ${typeof parsed}`
    );
  }

  return parsed as FormSpecConfig;
}

/**
 * Loads FormSpec constraint configuration from a .formspec.yml file.
 *
 * @param options - Options for loading configuration
 * @returns The loaded configuration with defaults applied
 *
 * @example
 * ```ts
 * // Load from current directory (searches for .formspec.yml)
 * const result = await loadConfig();
 *
 * // Load from specific directory
 * const result = await loadConfig({ cwd: '/path/to/project' });
 *
 * // Load from specific file
 * const result = await loadConfig({ configPath: '/path/to/config.yml' });
 * ```
 */
export async function loadConfig(
  options: LoadConfigOptions = {}
): Promise<LoadConfigResult> {
  const { cwd = process.cwd(), configPath, searchParents = true } = options;

  let resolvedPath: string | null = null;

  if (configPath) {
    resolvedPath = resolve(cwd, configPath);
    try {
      await readFile(resolvedPath);
    } catch {
      throw new Error(`Config file not found at ${resolvedPath}`);
    }
  } else {
    resolvedPath = await findConfigFile(cwd, searchParents);
  }

  if (!resolvedPath) {
    return {
      config: mergeWithDefaults(undefined),
      configPath: null,
      found: false,
    };
  }

  const fileConfig = await parseConfigFile(resolvedPath);
  const config = mergeWithDefaults(fileConfig.constraints);

  return {
    config,
    configPath: resolvedPath,
    found: true,
  };
}

/**
 * Synchronously loads config from a pre-parsed YAML string.
 * Useful for testing or when config is already available.
 *
 * @param yamlContent - The YAML content to parse
 * @returns The parsed and merged configuration
 */
export function loadConfigFromString(
  yamlContent: string
): ResolvedConstraintConfig {
  const parsed = parseYaml(yamlContent) as FormSpecConfig | null | undefined;

  if (parsed === null || parsed === undefined) {
    return mergeWithDefaults(undefined);
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Invalid config content: expected an object, got ${typeof parsed}`
    );
  }

  return mergeWithDefaults(parsed.constraints);
}

/**
 * Creates a constraint configuration directly from an object.
 * Useful for programmatic configuration without YAML.
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
 */
export function defineConstraints(
  config: ConstraintConfig
): ResolvedConstraintConfig {
  return mergeWithDefaults(config);
}
