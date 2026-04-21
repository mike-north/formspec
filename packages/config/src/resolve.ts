import type {
  FormSpecConfig,
  FormSpecPackageOverride,
  ConstraintConfig,
  ResolvedConstraintConfig,
} from "./types.js";
import { mergeWithDefaults } from "./defaults.js";

/**
 * Resolved configuration for a specific file, with all defaults applied
 * and per-package overrides merged.
 *
 * @public
 */
export interface ResolvedFormSpecConfig {
  /** Resolved extensions (empty array if none configured). */
  readonly extensions: readonly import("@formspec/core").ExtensionDefinition[];
  /** Resolved constraint config with all defaults filled in. */
  readonly constraints: ResolvedConstraintConfig;
  /** Resolved metadata policy, or undefined for FormSpec built-in. */
  readonly metadata: import("@formspec/core").MetadataPolicyInput | undefined;
  /** Resolved vendor prefix. */
  readonly vendorPrefix: string;
  /** Resolved enum serialization mode. */
  readonly enumSerialization: "enum" | "oneOf" | "smart-size";
}

/**
 * Resolves the effective config for a specific file by matching against
 * the `packages` glob map and merging with root-level settings.
 *
 * Package overrides are evaluated in declaration order — the first matching
 * pattern wins. Declare more specific patterns before broader ones.
 *
 * @param config - The root FormSpecConfig
 * @param filePath - Absolute or relative path to the file being processed
 * @param configDir - Directory containing the config file (for relative path resolution)
 * @returns Fully resolved config with defaults applied
 *
 * @public
 */
export function resolveConfigForFile(
  config: FormSpecConfig,
  filePath: string,
  configDir: string
): ResolvedFormSpecConfig {
  const override = findMatchingOverride(config.packages, filePath, configDir);
  const merged = applyOverride(config, override);

  return {
    extensions: merged.extensions ?? [],
    constraints: mergeWithDefaults(merged.constraints),
    metadata: merged.metadata,
    vendorPrefix: merged.vendorPrefix ?? "x-formspec",
    enumSerialization: merged.enumSerialization ?? "enum",
  };
}

/**
 * Finds the first matching package override for the given file path.
 */
function findMatchingOverride(
  packages: FormSpecConfig["packages"],
  filePath: string,
  configDir: string
): FormSpecPackageOverride | undefined {
  if (packages === undefined) return undefined;

  // Normalize the file path relative to the config directory
  const relative = relativePath(filePath, configDir);

  for (const [pattern, override] of Object.entries(packages)) {
    if (matchGlob(pattern, relative)) {
      return override;
    }
  }

  return undefined;
}

/**
 * Deep-merges a package override into the root config. Override values
 * take precedence on conflict; unspecified override fields inherit from root.
 */
function applyOverride(
  config: FormSpecConfig,
  override: FormSpecPackageOverride | undefined
): FormSpecConfig {
  if (override === undefined) return config;

  return {
    ...config,
    ...(override.constraints !== undefined && {
      constraints: deepMergeConstraints(config.constraints, override.constraints),
    }),
    ...(override.enumSerialization !== undefined && {
      enumSerialization: override.enumSerialization,
    }),
    ...(override.metadata !== undefined && { metadata: override.metadata }),
  };
}

/**
 * Deep-merges constraint configs. Override fields take precedence;
 * unspecified override sub-fields inherit from the base.
 */
function deepMergeConstraints(
  base: ConstraintConfig | undefined,
  override: ConstraintConfig
): ConstraintConfig {
  if (base === undefined) return override;

  const merged: ConstraintConfig = {
    fieldTypes: { ...base.fieldTypes, ...override.fieldTypes },
    layout: { ...base.layout, ...override.layout },
    fieldOptions: { ...base.fieldOptions, ...override.fieldOptions },
  };

  // Merge uiSchema if either side defines it
  if (base.uiSchema !== undefined || override.uiSchema !== undefined) {
    merged.uiSchema = {
      layouts: { ...base.uiSchema?.layouts, ...override.uiSchema?.layouts },
    };
    if (base.uiSchema?.rules !== undefined || override.uiSchema?.rules !== undefined) {
      merged.uiSchema.rules = {
        ...base.uiSchema?.rules,
        ...override.uiSchema?.rules,
      };
      if (
        base.uiSchema?.rules?.effects !== undefined ||
        override.uiSchema?.rules?.effects !== undefined
      ) {
        merged.uiSchema.rules.effects = {
          ...base.uiSchema?.rules?.effects,
          ...override.uiSchema?.rules?.effects,
        };
      }
    }
  }

  // Merge controlOptions with nested custom dict
  if (base.controlOptions !== undefined || override.controlOptions !== undefined) {
    merged.controlOptions = {
      ...base.controlOptions,
      ...override.controlOptions,
    };
    if (
      base.controlOptions?.custom !== undefined ||
      override.controlOptions?.custom !== undefined
    ) {
      merged.controlOptions.custom = {
        ...base.controlOptions?.custom,
        ...override.controlOptions?.custom,
      };
    }
  }

  return merged;
}

/**
 * Computes a relative path from configDir to filePath.
 * Handles both absolute and already-relative paths.
 */
function relativePath(filePath: string, configDir: string): string {
  // Simple implementation — strip the configDir prefix if present
  const normalized = filePath.replace(/\\/g, "/");
  const normalizedDir = configDir.replace(/\\/g, "/").replace(/\/$/, "") + "/";

  if (normalized.startsWith(normalizedDir)) {
    return normalized.slice(normalizedDir.length);
  }

  return normalized;
}

/**
 * Minimal glob matching supporting `*`, `**`, and `?` patterns.
 * Does not support brace expansion, character classes, or negation.
 *
 * @internal
 */
function matchGlob(pattern: string, path: string): boolean {
  const regexStr = pattern
    .replace(/\\/g, "/")
    .replace(/[.+?^${}()|[\]]/g, "\\$&") // escape regex special chars (incl. ?)
    .replace(/\\\?/g, "[^/]") // glob ? = single non-separator char
    .replace(/\*\*/g, "{{GLOBSTAR}}") // placeholder for **
    .replace(/\*/g, "[^/]*") // * matches within a segment
    .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches across segments

  return new RegExp(`^${regexStr}$`).test(path);
}
