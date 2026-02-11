/**
 * Converts between playground UI constraint config and @formspec/constraints config.
 */

import type { ConstraintsConfig } from "../components/Constraints";
import type { ConstraintConfig, Severity } from "@formspec/constraints/browser";

/**
 * Converts UI boolean (true = allowed, false = forbidden) to Severity.
 */
function boolToSeverity(allowed: boolean): Severity {
  return allowed ? "off" : "error";
}

/**
 * Converts playground ConstraintsConfig to @formspec/constraints ConstraintConfig.
 */
export function toConstraintConfig(uiConfig: ConstraintsConfig): ConstraintConfig {
  return {
    fieldTypes: {
      text: boolToSeverity(uiConfig.fieldTypes.text),
      number: boolToSeverity(uiConfig.fieldTypes.number),
      boolean: boolToSeverity(uiConfig.fieldTypes.boolean),
      staticEnum: boolToSeverity(uiConfig.fieldTypes.enum),
      dynamicEnum: boolToSeverity(uiConfig.fieldTypes.dynamicEnum),
      dynamicSchema: boolToSeverity(uiConfig.fieldTypes.dynamicSchema),
      array: boolToSeverity(uiConfig.fieldTypes.array),
      object: boolToSeverity(uiConfig.fieldTypes.object),
    },
    layout: {
      group: boolToSeverity(uiConfig.layout.group),
      conditionals: boolToSeverity(uiConfig.layout.when),
      maxNestingDepth: uiConfig.layout.maxNestingDepth,
    },
  };
}

/**
 * Checks if any constraints are actually restricting something.
 * Returns false if all constraints are "off" (everything allowed).
 */
export function hasActiveConstraints(uiConfig: ConstraintsConfig): boolean {
  const fieldTypesRestricted = Object.values(uiConfig.fieldTypes).some((v) => !v);
  const layoutRestricted = !uiConfig.layout.group || !uiConfig.layout.when;
  return fieldTypesRestricted || layoutRestricted;
}
