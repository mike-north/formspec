/**
 * Constraint validation for the FormSpec IR.
 *
 * @packageDocumentation
 */

export { validateIR } from "./constraint-validator.js";
export type {
  ValidationDiagnostic,
  ValidationResult,
  ValidateIROptions,
} from "./constraint-validator.js";

// Re-export ExtensionRegistry from the extensions module for convenience
export type { ExtensionRegistry } from "../extensions/index.js";
