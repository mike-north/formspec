/**
 * Constraint validator for the FormSpec IR.
 *
 * Performs the Validate pipeline phase:
 * - Contradiction detection between paired constraints
 * - Type applicability checks (e.g. numeric constraints on string fields)
 * - Custom constraint type applicability (when extension registry is provided)
 * - Unknown extension warnings (when a registry is provided)
 *
 * @packageDocumentation
 */

import type {
  FormIR,
  FormIRElement,
  FieldNode,
  TypeNode,
  ConstraintNode,
  NumericConstraintNode,
  LengthConstraintNode,
  EnumMemberConstraintNode,
  Provenance,
  ObjectProperty,
} from "@formspec/core";
import type { ExtensionRegistry } from "../extensions/index.js";

// =============================================================================
// PUBLIC API TYPES
// =============================================================================

/**
 * A structured diagnostic produced by constraint validation.
 *
 * The `code` follows the format: `{VENDOR}-{CATEGORY}-{NNN}`.
 * - VENDOR defaults to "FORMSPEC" (configurable via `vendorPrefix`).
 * - Categories: CONTRADICTION, TYPE_MISMATCH, UNKNOWN_EXTENSION
 */
export interface ValidationDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  /** Location of the primary constraint involved in the violation. */
  readonly primaryLocation: Provenance;
  /** Related locations (e.g., the other side of a contradiction pair). */
  readonly relatedLocations: readonly Provenance[];
}

/** Result of validating a {@link FormIR}. */
export interface ValidationResult {
  readonly diagnostics: readonly ValidationDiagnostic[];
  /** `true` if there are no error-severity diagnostics (warnings are OK). */
  readonly valid: boolean;
}

/** Options for constraint validation. */
export interface ValidateIROptions {
  /**
   * Vendor prefix used when constructing diagnostic codes.
   * @defaultValue "FORMSPEC"
   */
  readonly vendorPrefix?: string;
  /**
   * Extension registry for resolving custom constraint type applicability.
   * When provided, custom constraints with `applicableTypes` will be
   * validated against the field's type node kind. Custom constraints
   * whose IDs are absent from this registry emit a WARNING (UNKNOWN_EXTENSION).
   * When omitted, custom constraints are silently skipped.
   */
  readonly extensionRegistry?: ExtensionRegistry;
}

// =============================================================================
// CONTEXT
// =============================================================================

/** Mutable accumulator threaded through the validation walk. */
interface ValidationContext {
  readonly diagnostics: ValidationDiagnostic[];
  readonly vendorPrefix: string;
  readonly extensionRegistry: ExtensionRegistry | undefined;
}

// =============================================================================
// DIAGNOSTIC FACTORIES
// =============================================================================

type DiagnosticCategory = "CONTRADICTION" | "TYPE_MISMATCH" | "UNKNOWN_EXTENSION";

function makeCode(ctx: ValidationContext, category: DiagnosticCategory, number: number): string {
  return `${ctx.vendorPrefix}-${category}-${String(number).padStart(3, "0")}`;
}

function addContradiction(
  ctx: ValidationContext,
  message: string,
  primary: Provenance,
  related: Provenance
): void {
  ctx.diagnostics.push({
    code: makeCode(ctx, "CONTRADICTION", 1),
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [related],
  });
}

function addTypeMismatch(ctx: ValidationContext, message: string, primary: Provenance): void {
  ctx.diagnostics.push({
    code: makeCode(ctx, "TYPE_MISMATCH", 1),
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addUnknownExtension(ctx: ValidationContext, message: string, primary: Provenance): void {
  ctx.diagnostics.push({
    code: makeCode(ctx, "UNKNOWN_EXTENSION", 1),
    message,
    severity: "warning",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

// =============================================================================
// CONSTRAINT NARROWING HELPERS
// =============================================================================

/** Extract the first numeric constraint with the given kind, if present. */
function findNumeric(
  constraints: readonly ConstraintNode[],
  constraintKind: NumericConstraintNode["constraintKind"]
): NumericConstraintNode | undefined {
  return constraints.find((c): c is NumericConstraintNode => c.constraintKind === constraintKind);
}

/** Extract the first length constraint with the given kind, if present. */
function findLength(
  constraints: readonly ConstraintNode[],
  constraintKind: LengthConstraintNode["constraintKind"]
): LengthConstraintNode | undefined {
  return constraints.find((c): c is LengthConstraintNode => c.constraintKind === constraintKind);
}

/** Extract all allowedMembers constraints. */
function findAllowedMembers(
  constraints: readonly ConstraintNode[]
): readonly EnumMemberConstraintNode[] {
  return constraints.filter(
    (c): c is EnumMemberConstraintNode => c.constraintKind === "allowedMembers"
  );
}

// =============================================================================
// CONTRADICTION DETECTION
// =============================================================================

function checkNumericContradictions(
  ctx: ValidationContext,
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const min = findNumeric(constraints, "minimum");
  const max = findNumeric(constraints, "maximum");
  const exMin = findNumeric(constraints, "exclusiveMinimum");
  const exMax = findNumeric(constraints, "exclusiveMaximum");

  // minimum > maximum
  if (min !== undefined && max !== undefined && min.value > max.value) {
    addContradiction(
      ctx,
      `Field "${fieldName}": minimum (${String(min.value)}) is greater than maximum (${String(max.value)})`,
      min.provenance,
      max.provenance
    );
  }

  // exclusiveMinimum >= maximum
  if (exMin !== undefined && max !== undefined && exMin.value >= max.value) {
    addContradiction(
      ctx,
      `Field "${fieldName}": exclusiveMinimum (${String(exMin.value)}) is greater than or equal to maximum (${String(max.value)})`,
      exMin.provenance,
      max.provenance
    );
  }

  // minimum >= exclusiveMaximum
  if (min !== undefined && exMax !== undefined && min.value >= exMax.value) {
    addContradiction(
      ctx,
      `Field "${fieldName}": minimum (${String(min.value)}) is greater than or equal to exclusiveMaximum (${String(exMax.value)})`,
      min.provenance,
      exMax.provenance
    );
  }

  // exclusiveMinimum >= exclusiveMaximum
  if (exMin !== undefined && exMax !== undefined && exMin.value >= exMax.value) {
    addContradiction(
      ctx,
      `Field "${fieldName}": exclusiveMinimum (${String(exMin.value)}) is greater than or equal to exclusiveMaximum (${String(exMax.value)})`,
      exMin.provenance,
      exMax.provenance
    );
  }
}

function checkLengthContradictions(
  ctx: ValidationContext,
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const minLen = findLength(constraints, "minLength");
  const maxLen = findLength(constraints, "maxLength");

  if (minLen !== undefined && maxLen !== undefined && minLen.value > maxLen.value) {
    addContradiction(
      ctx,
      `Field "${fieldName}": minLength (${String(minLen.value)}) is greater than maxLength (${String(maxLen.value)})`,
      minLen.provenance,
      maxLen.provenance
    );
  }

  const minItems = findLength(constraints, "minItems");
  const maxItems = findLength(constraints, "maxItems");

  if (minItems !== undefined && maxItems !== undefined && minItems.value > maxItems.value) {
    addContradiction(
      ctx,
      `Field "${fieldName}": minItems (${String(minItems.value)}) is greater than maxItems (${String(maxItems.value)})`,
      minItems.provenance,
      maxItems.provenance
    );
  }
}

function checkAllowedMembersContradiction(
  ctx: ValidationContext,
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const members = findAllowedMembers(constraints);
  if (members.length < 2) return;

  // Intersect all allowedMembers sets; if empty — contradiction
  const firstSet = new Set(members[0]?.members ?? []);
  for (let i = 1; i < members.length; i++) {
    const current = members[i];
    if (current === undefined) continue;
    for (const m of firstSet) {
      if (!current.members.includes(m)) {
        firstSet.delete(m);
      }
    }
  }

  if (firstSet.size === 0) {
    const first = members[0];
    const second = members[1];
    if (first !== undefined && second !== undefined) {
      addContradiction(
        ctx,
        `Field "${fieldName}": allowedMembers constraints have an empty intersection (no valid values remain)`,
        first.provenance,
        second.provenance
      );
    }
  }
}

// =============================================================================
// TYPE APPLICABILITY CHECKS
// =============================================================================

/** Return a readable label for a type node for use in diagnostics. */
function typeLabel(type: TypeNode): string {
  switch (type.kind) {
    case "primitive":
      return type.primitiveKind;
    case "enum":
      return "enum";
    case "array":
      return "array";
    case "object":
      return "object";
    case "union":
      return "union";
    case "reference":
      return `reference(${type.name})`;
    case "dynamic":
      return `dynamic(${type.dynamicKind})`;
    case "custom":
      return `custom(${type.typeId})`;
    default: {
      const _exhaustive: never = type;
      return String(_exhaustive);
    }
  }
}

function checkTypeApplicability(
  ctx: ValidationContext,
  fieldName: string,
  type: TypeNode,
  constraints: readonly ConstraintNode[]
): void {
  const isNumber = type.kind === "primitive" && type.primitiveKind === "number";
  const isString = type.kind === "primitive" && type.primitiveKind === "string";
  const isArray = type.kind === "array";
  const isEnum = type.kind === "enum";

  const label = typeLabel(type);

  for (const constraint of constraints) {
    // Path-targeted constraints (e.g., `@Minimum :value 0`) target a sub-field,
    // not the field itself. Skip type-applicability checks for these — the
    // constraint applies to the resolved sub-field type, not the declared field type.
    if (constraint.path) {
      // However, when the declared field type cannot be traversed (primitives or
      // enums), a path-targeted constraint is inherently invalid.
      if (type.kind === "primitive" || type.kind === "enum") {
        addTypeMismatch(
          ctx,
          `Field "${fieldName}": path-targeted constraint "${constraint.constraintKind}" is invalid because type "${label}" cannot be traversed`,
          constraint.provenance
        );
      }
      continue;
    }

    const ck = constraint.constraintKind;

    switch (ck) {
      case "minimum":
      case "maximum":
      case "exclusiveMinimum":
      case "exclusiveMaximum":
      case "multipleOf": {
        if (!isNumber) {
          addTypeMismatch(
            ctx,
            `Field "${fieldName}": constraint "${ck}" is only valid on number fields, but field type is "${label}"`,
            constraint.provenance
          );
        }
        break;
      }
      case "minLength":
      case "maxLength":
      case "pattern": {
        if (!isString) {
          addTypeMismatch(
            ctx,
            `Field "${fieldName}": constraint "${ck}" is only valid on string fields, but field type is "${label}"`,
            constraint.provenance
          );
        }
        break;
      }
      case "minItems":
      case "maxItems":
      case "uniqueItems": {
        if (!isArray) {
          addTypeMismatch(
            ctx,
            `Field "${fieldName}": constraint "${ck}" is only valid on array fields, but field type is "${label}"`,
            constraint.provenance
          );
        }
        break;
      }
      case "allowedMembers": {
        if (!isEnum) {
          addTypeMismatch(
            ctx,
            `Field "${fieldName}": constraint "allowedMembers" is only valid on enum fields, but field type is "${label}"`,
            constraint.provenance
          );
        }
        break;
      }
      case "custom": {
        checkCustomConstraint(ctx, fieldName, type, constraint);
        break;
      }
      default: {
        const _exhaustive: never = constraint;
        throw new Error(
          `Unhandled constraint kind: ${(_exhaustive as ConstraintNode).constraintKind}`
        );
      }
    }
  }
}

/**
 * Check a custom constraint against the extension registry.
 *
 * When the registry is available:
 * - If the constraint ID is not found, emit UNKNOWN_EXTENSION warning
 * - If found and the registration has `applicableTypes`, verify the field's
 *   type kind is in that list (emit TYPE_MISMATCH if not)
 * - If `applicableTypes` is null, the constraint applies to any type
 *
 * When no registry is available, custom constraints are silently skipped.
 */
function checkCustomConstraint(
  ctx: ValidationContext,
  fieldName: string,
  type: TypeNode,
  constraint: ConstraintNode & { readonly constraintKind: "custom" }
): void {
  if (ctx.extensionRegistry === undefined) return;

  const registration = ctx.extensionRegistry.findConstraint(constraint.constraintId);

  if (registration === undefined) {
    addUnknownExtension(
      ctx,
      `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not registered in the extension registry`,
      constraint.provenance
    );
    return;
  }

  // If applicableTypes is null, the constraint applies to any type
  if (registration.applicableTypes === null) return;

  if (!registration.applicableTypes.includes(type.kind)) {
    addTypeMismatch(
      ctx,
      `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not applicable to type "${typeLabel(type)}"`,
      constraint.provenance
    );
  }
}

// =============================================================================
// FIELD VALIDATION
// =============================================================================

function validateFieldNode(ctx: ValidationContext, field: FieldNode): void {
  validateConstraints(ctx, field.name, field.type, field.constraints);

  // Recurse into object type properties
  if (field.type.kind === "object") {
    for (const prop of field.type.properties) {
      validateObjectProperty(ctx, field.name, prop);
    }
  }
}

function validateObjectProperty(
  ctx: ValidationContext,
  parentName: string,
  prop: ObjectProperty
): void {
  const qualifiedName = `${parentName}.${prop.name}`;
  validateConstraints(ctx, qualifiedName, prop.type, prop.constraints);

  // Recurse further if this property is also an object
  if (prop.type.kind === "object") {
    for (const nestedProp of prop.type.properties) {
      validateObjectProperty(ctx, qualifiedName, nestedProp);
    }
  }
}

function validateConstraints(
  ctx: ValidationContext,
  name: string,
  type: TypeNode,
  constraints: readonly ConstraintNode[]
): void {
  checkNumericContradictions(ctx, name, constraints);
  checkLengthContradictions(ctx, name, constraints);
  checkAllowedMembersContradiction(ctx, name, constraints);
  checkTypeApplicability(ctx, name, type, constraints);
}

// =============================================================================
// RECURSIVE ELEMENT WALK
// =============================================================================

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
      const _exhaustive: never = element;
      throw new Error(`Unhandled element kind: ${(_exhaustive as FormIRElement).kind}`);
    }
  }
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Validate all constraints in a {@link FormIR}.
 *
 * Checks for:
 * - Contradictions between paired constraints (e.g. `minimum > maximum`)
 * - Type applicability violations (e.g. `minLength` on a number field)
 * - Custom constraint type applicability (via extension registry)
 * - Unknown extension constraints (when `extensionRegistry` is provided)
 *
 * @param ir - The form IR to validate.
 * @param options - Optional configuration.
 * @returns A {@link ValidationResult} with diagnostics and a `valid` flag.
 */
export function validateIR(ir: FormIR, options?: ValidateIROptions): ValidationResult {
  const ctx: ValidationContext = {
    diagnostics: [],
    vendorPrefix: options?.vendorPrefix ?? "FORMSPEC",
    extensionRegistry: options?.extensionRegistry,
  };

  for (const element of ir.elements) {
    validateElement(ctx, element);
  }

  return {
    diagnostics: ctx.diagnostics,
    valid: ctx.diagnostics.every((d) => d.severity !== "error"),
  };
}
