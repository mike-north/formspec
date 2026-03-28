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
  type ConstraintSemanticDiagnostic,
} from "@formspec/analysis";
import type { FormIR, FormIRElement, FieldNode, ObjectProperty } from "@formspec/core";
import type { ExtensionRegistry } from "../extensions/index.js";

export type ValidationDiagnostic = ConstraintSemanticDiagnostic;

export interface ValidationResult {
  readonly diagnostics: readonly ValidationDiagnostic[];
  readonly valid: boolean;
}

export interface ValidateIROptions {
  readonly vendorPrefix?: string;
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
