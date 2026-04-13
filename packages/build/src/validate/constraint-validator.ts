/**
 * Constraint validator for the FormSpec IR.
 *
 * Delegates target-centric semantic analysis to `@formspec/analysis` so build
 * validation and editor tooling share the same inheritance, path-target,
 * contradiction, and broadening semantics.
 *
 * @packageDocumentation
 */

import {
  analyzeConstraintTargets,
  type ConstraintRegistryLike,
} from "@formspec/analysis/internal";
import type { FormIR, FormIRElement, FieldNode, ObjectProperty } from "@formspec/core/internals";
import type { ExtensionRegistry } from "../extensions/index.js";

/**
 * Supported severity levels returned by static build validation.
 *
 * @public
 */
export type ValidationDiagnosticSeverity = "error" | "warning";

/**
 * Public source-location shape attached to validation diagnostics.
 *
 * This mirrors the provenance information surfaced by the shared analysis
 * layer without exposing `@formspec/core/internals` through the public API.
 *
 * @public
 */
export interface ValidationDiagnosticLocation {
  /** Authoring surface that produced the diagnostic location. */
  readonly surface: "tsdoc" | "chain-dsl" | "extension" | "inferred";
  /** Absolute path to the source file. */
  readonly file: string;
  /** 1-based line number in the source file. */
  readonly line: number;
  /** 0-based column number in the source file. */
  readonly column: number;
  /** Optional span length in characters. */
  readonly length?: number;
  /** Optional tag or construct associated with the location. */
  readonly tagName?: string;
}

/**
 * A machine-readable validation diagnostic returned by static schema analysis.
 *
 * @public
 */
export interface ValidationDiagnostic {
  /** Stable machine-readable diagnostic code. */
  readonly code: string;
  /** Human-readable explanation of the validation problem. */
  readonly message: string;
  /** Severity of the reported validation problem. */
  readonly severity: ValidationDiagnosticSeverity;
  /** Primary source location associated with the diagnostic. */
  readonly primaryLocation: ValidationDiagnosticLocation;
  /** Related source locations that add context to the diagnostic. */
  readonly relatedLocations: readonly ValidationDiagnosticLocation[];
}

/**
 * Result of validating canonical FormIR before schema emission.
 *
 * @public
 */
export interface ValidationResult {
  /** Diagnostics produced during validation. */
  readonly diagnostics: readonly ValidationDiagnostic[];
  /** Whether any error-severity diagnostics were produced. */
  readonly valid: boolean;
}

/**
 * Options for validating canonical FormIR.
 *
 * @public
 */
export interface ValidateIROptions {
  /** Vendor prefix used when resolving extension-backed keywords. */
  readonly vendorPrefix?: string;
  /** Extension registry used to resolve custom constraints and types. */
  readonly extensionRegistry?: ExtensionRegistry;
}

interface ValidationContext {
  readonly diagnostics: ValidationDiagnostic[];
  readonly extensionRegistry: ConstraintRegistryLike | undefined;
  readonly typeRegistry: FormIR["typeRegistry"];
}

function validateFieldNode(ctx: ValidationContext, field: FieldNode): void {
  const analysis = analyzeConstraintTargets(
    field.name,
    field.type,
    field.constraints,
    ctx.typeRegistry,
    ctx.extensionRegistry === undefined
      ? undefined
      : {
          extensionRegistry: ctx.extensionRegistry,
        }
  );
  ctx.diagnostics.push(...analysis.diagnostics);

  if (field.type.kind === "object") {
    for (const property of field.type.properties) {
      validateObjectProperty(ctx, field.name, property);
    }
  }
}

function validateObjectProperty(
  ctx: ValidationContext,
  parentName: string,
  property: ObjectProperty
): void {
  const qualifiedName = `${parentName}.${property.name}`;
  const analysis = analyzeConstraintTargets(
    qualifiedName,
    property.type,
    property.constraints,
    ctx.typeRegistry,
    ctx.extensionRegistry === undefined
      ? undefined
      : {
          extensionRegistry: ctx.extensionRegistry,
        }
  );
  ctx.diagnostics.push(...analysis.diagnostics);

  if (property.type.kind === "object") {
    for (const nestedProperty of property.type.properties) {
      validateObjectProperty(ctx, qualifiedName, nestedProperty);
    }
  }
}

function validateElement(ctx: ValidationContext, element: FormIRElement): void {
  switch (element.kind) {
    case "field":
      validateFieldNode(ctx, element);
      break;
    case "group":
      for (const child of element.elements) {
        validateElement(ctx, child);
      }
      break;
    case "conditional":
      for (const child of element.elements) {
        validateElement(ctx, child);
      }
      break;
    default: {
      const exhaustive: never = element;
      throw new Error(`Unhandled element kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * Validates canonical FormIR and returns all discovered diagnostics.
 *
 * @public
 */
export function validateIR(ir: FormIR, options?: ValidateIROptions): ValidationResult {
  const ctx: ValidationContext = {
    diagnostics: [],
    extensionRegistry: options?.extensionRegistry,
    typeRegistry: ir.typeRegistry,
  };

  for (const element of ir.elements) {
    validateElement(ctx, element);
  }

  return {
    diagnostics: ctx.diagnostics,
    valid: ctx.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  };
}
