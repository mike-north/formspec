/**
 * Loading-side package override resolution.
 *
 * This module lives with loading concerns because its inputs are file paths
 * and package override globs. The result is application-shaped config data,
 * but the work is path manipulation against loader-owned override rules.
 */
import type {
  FormSpecConfig,
  FormSpecPackageOverride,
  DSLPolicy,
  ResolvedDSLPolicy,
} from "../application/types.js";
import { mergeWithDefaults } from "../application/defaults.js";

/**
 * Resolved configuration for a specific file, with all defaults applied
 * and per-package overrides merged.
 *
 * @public
 */
export interface ResolvedFormSpecConfig {
  /** Resolved extensions (empty array if none configured). */
  readonly extensions: readonly import("@formspec/core").ExtensionDefinition[];
  /** Resolved DSL policy with all defaults filled in. */
  readonly constraints: ResolvedDSLPolicy;
  /** Resolved metadata policy, or undefined for FormSpec built-in. */
  readonly metadata: import("@formspec/core").MetadataPolicyInput | undefined;
  /** Resolved vendor prefix. */
  readonly vendorPrefix: string;
  /** Resolved enum serialization mode. */
  readonly enumSerialization: "enum" | "oneOf" | "smart-size";
  /** Resolved serialization settings for vocabulary and dialect emission. */
  readonly serialization: FormSpecConfig["serialization"];
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
    serialization: merged.serialization,
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
 * Deep-merges DSL-policy configs. Override fields take precedence;
 * unspecified override sub-fields inherit from the base.
 */
function deepMergeConstraints(base: DSLPolicy | undefined, override: DSLPolicy): DSLPolicy {
  if (base === undefined) return override;

  const merged: DSLPolicy = {
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
 * A pattern-leading `**\/` matches zero or more leading directories,
 * following standard glob semantics: `**\/forms.ts` matches a top-level
 * `forms.ts` as well as `src/forms.ts`. Trailing and interior `**`
 * (e.g. `packages/api/**` or `packages/**\/forms.ts`) match one or more
 * characters (including path separators), unchanged from prior behavior.
 *
 * @internal
 */
function matchGlob(pattern: string, path: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");

  // Only a pattern-*leading* `**/` gets the zero-directory treatment; other
  // `**` occurrences (trailing, interior) keep their prior `.*` semantics.
  const hasLeadingGlobstar = normalizedPattern.startsWith("**/");
  const rest = hasLeadingGlobstar ? normalizedPattern.slice(3) : normalizedPattern;

  const regexBody = rest
    .replace(/[.+?^${}()|[\]]/g, "\\$&") // escape regex special chars (incl. ?)
    .replace(/\\\?/g, "[^/]") // glob ? = single non-separator char
    .replace(/\*\*/g, "{{GLOBSTAR}}") // placeholder for remaining **
    .replace(/\*/g, "[^/]*") // * matches within a segment
    .replace(/{{GLOBSTAR}}/g, ".*"); // ** matches across segments

  const regexStr = hasLeadingGlobstar ? `(?:.*/)?${regexBody}` : regexBody;

  return new RegExp(`^${regexStr}$`).test(path);
}
