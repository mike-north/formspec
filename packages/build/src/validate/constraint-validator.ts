/**
 * Constraint validator for the FormSpec IR.
 *
 * Performs the Validate pipeline phase:
 * - Contradiction detection between paired constraints
 * - Type applicability checks (e.g. numeric constraints on string fields)
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

/**
 * Registry of known extension constraint IDs for DEC-006 unknown extension checks.
 * Keys are constraint IDs (e.g., `"x-stripe/monetary/currency"`).
 */
export type ExtensionRegistry = ReadonlySet<string>;

/** Options for constraint validation. */
export interface ValidateIROptions {
  /**
   * Vendor prefix used when constructing diagnostic codes.
   * @defaultValue "FORMSPEC"
   */
  readonly vendorPrefix?: string;
  /**
   * Registry of known extension constraint IDs.
   * When provided, custom constraints with IDs absent from this registry
   * emit a WARNING (UNKNOWN_EXTENSION). When omitted, no warning is emitted.
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

function addTypeMismatch(
  ctx: ValidationContext,
  message: string,
  primary: Provenance
): void {
  ctx.diagnostics.push({
    code: makeCode(ctx, "TYPE_MISMATCH", 1),
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addUnknownExtension(
  ctx: ValidationContext,
  message: string,
  primary: Provenance
): void {
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

/**
 * Extract the effective numeric constraint with the given kind.
 *
 * When multiple constraints of the same kind exist (e.g. from a type alias +
 * a JSDoc tag), derives the most restrictive effective bound:
 * - minimum / exclusiveMinimum: the largest value (strictest lower bound)
 * - maximum / exclusiveMaximum: the smallest value (strictest upper bound)
 *
 * The returned node is the one that contributes the effective bound, so its
 * provenance points to the right location in diagnostics.
 */
function findNumeric(
  constraints: readonly ConstraintNode[],
  constraintKind: NumericConstraintNode["constraintKind"]
): NumericConstraintNode | undefined {
  const matching = constraints.filter(
    (c): c is NumericConstraintNode => c.constraintKind === constraintKind
  );
  if (matching.length === 0) return undefined;

  let best = matching[0];
  for (let i = 1; i < matching.length; i++) {
    const current = matching[i];
    if (current === undefined || best === undefined) continue;
    switch (constraintKind) {
      case "minimum":
      case "exclusiveMinimum":
        // Largest lower bound is the most restrictive
        if (current.value > best.value) best = current;
        break;
      case "maximum":
      case "exclusiveMaximum":
        // Smallest upper bound is the most restrictive
        if (current.value < best.value) best = current;
        break;
      case "multipleOf":
        // Keep the first; no clear "most restrictive" for multipleOf
        break;
      default: {
        const _exhaustive: never = constraintKind;
        void _exhaustive;
      }
    }
  }
  return best;
}

/**
 * Extract the effective length constraint with the given kind.
 *
 * When multiple constraints of the same kind exist, derives the most
 * restrictive effective bound:
 * - minLength / minItems: the largest value (strictest lower bound)
 * - maxLength / maxItems: the smallest value (strictest upper bound)
 */
function findLength(
  constraints: readonly ConstraintNode[],
  constraintKind: LengthConstraintNode["constraintKind"]
): LengthConstraintNode | undefined {
  const matching = constraints.filter(
    (c): c is LengthConstraintNode => c.constraintKind === constraintKind
  );
  if (matching.length === 0) return undefined;

  let best = matching[0];
  for (let i = 1; i < matching.length; i++) {
    const current = matching[i];
    if (current === undefined || best === undefined) continue;
    switch (constraintKind) {
      case "minLength":
      case "minItems":
        // Largest lower bound is the most restrictive
        if (current.value > best.value) best = current;
        break;
      case "maxLength":
      case "maxItems":
        // Smallest upper bound is the most restrictive
        if (current.value < best.value) best = current;
        break;
      default: {
        const _exhaustive: never = constraintKind;
        void _exhaustive;
      }
    }
  }
  return best;
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
  // For union, reference, dynamic, and custom types we conservatively skip
  // applicability checks — at least one underlying member type may support the
  // constraint, and we cannot resolve the concrete type here without deeper
  // analysis. This avoids false-positive type-mismatch diagnostics on optional
  // fields (union of T | null) and on extension/reference types.
  const isOpaque =
    type.kind === "union" ||
    type.kind === "reference" ||
    type.kind === "dynamic" ||
    type.kind === "custom";

  if (isOpaque) return;

  const isNumber = type.kind === "primitive" && type.primitiveKind === "number";
  const isString = type.kind === "primitive" && type.primitiveKind === "string";
  const isArray = type.kind === "array";
  const isEnum = type.kind === "enum";

  const label = typeLabel(type);

  for (const constraint of constraints) {
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
        if (
          ctx.extensionRegistry !== undefined &&
          !ctx.extensionRegistry.has(constraint.constraintId)
        ) {
          addUnknownExtension(
            ctx,
            `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not registered in the extension registry`,
            constraint.provenance
          );
        }
        break;
      }
      default: {
        // Compile-time exhaustiveness guard. Skip unknown constraint kinds
        // gracefully (e.g. from a newer core version) rather than throwing.
        const _exhaustive: never = constraint;
        void _exhaustive;
      }
    }
  }
}

// =============================================================================
// FIELD VALIDATION
// =============================================================================

function validateFieldNode(ctx: ValidationContext, field: FieldNode): void {
  validateConstraints(ctx, field.name, field.type, field.constraints);
  validateTypeNode(ctx, field.name, field.type);
}

/**
 * Recursively validates constraints found in a TypeNode structure.
 *
 * Handles object properties, array items, and union members so that
 * constraints nested inside any composite type are checked.
 */
function validateTypeNode(ctx: ValidationContext, parentName: string, type: TypeNode): void {
  switch (type.kind) {
    case "object":
      for (const prop of type.properties) {
        validateObjectProperty(ctx, parentName, prop);
      }
      break;
    case "array":
      // Validate constraints on the element type (covers arrays of objects etc.)
      validateTypeNode(ctx, `${parentName}[]`, type.items);
      break;
    case "union":
      for (const member of type.members) {
        validateTypeNode(ctx, parentName, member);
      }
      break;
    case "primitive":
    case "enum":
    case "reference":
    case "dynamic":
    case "custom":
      // No nested constraints to validate for leaf types
      break;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
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
  validateTypeNode(ctx, qualifiedName, prop.type);
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
      // Compile-time exhaustiveness guard. Do not throw — unknown element kinds
      // (e.g. from a newer core version) should be skipped gracefully so that
      // validation can still check the rest of the IR.
      const _exhaustive: never = element;
      void _exhaustive;
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

  // Also validate types stored in the typeRegistry — these include named object
  // types referenced by fields, and their properties may carry constraints that
  // could contain contradictions or type mismatches.
  const visited = new Set<string>();
  for (const [name, typeDef] of Object.entries(ir.typeRegistry)) {
    if (visited.has(name)) continue;
    visited.add(name);
    validateTypeNode(ctx, name, typeDef.type);
  }

  return {
    diagnostics: ctx.diagnostics,
    valid: ctx.diagnostics.every((d) => d.severity !== "error"),
  };
}

