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
 * The `code` is a stable, machine-readable semantic identifier.
 * Examples: `CONTRADICTING_CONSTRAINTS`, `TYPE_MISMATCH`, `UNKNOWN_EXTENSION`.
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
  /** @deprecated Ignored. Diagnostic codes are semantic identifiers only. */
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
  readonly extensionRegistry: ExtensionRegistry | undefined;
  readonly typeRegistry: FormIR["typeRegistry"];
}

// =============================================================================
// DIAGNOSTIC FACTORIES
// =============================================================================

function addContradiction(
  ctx: ValidationContext,
  message: string,
  primary: Provenance,
  related: Provenance
): void {
  ctx.diagnostics.push({
    code: "CONTRADICTING_CONSTRAINTS",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [related],
  });
}

function addTypeMismatch(ctx: ValidationContext, message: string, primary: Provenance): void {
  ctx.diagnostics.push({
    code: "TYPE_MISMATCH",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addUnknownExtension(ctx: ValidationContext, message: string, primary: Provenance): void {
  ctx.diagnostics.push({
    code: "UNKNOWN_EXTENSION",
    message,
    severity: "warning",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addConstraintBroadening(
  ctx: ValidationContext,
  message: string,
  primary: Provenance,
  related: Provenance
): void {
  ctx.diagnostics.push({
    code: "CONSTRAINT_BROADENING",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [related],
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

type OrderedBoundKind =
  | "minimum"
  | "exclusiveMinimum"
  | "minLength"
  | "minItems"
  | "maximum"
  | "exclusiveMaximum"
  | "maxLength"
  | "maxItems";

type OrderedBoundConstraint = Extract<ConstraintNode, { readonly constraintKind: OrderedBoundKind }>;

function isOrderedBoundConstraint(constraint: ConstraintNode): constraint is OrderedBoundConstraint {
  return (
    constraint.constraintKind === "minimum" ||
    constraint.constraintKind === "exclusiveMinimum" ||
    constraint.constraintKind === "minLength" ||
    constraint.constraintKind === "minItems" ||
    constraint.constraintKind === "maximum" ||
    constraint.constraintKind === "exclusiveMaximum" ||
    constraint.constraintKind === "maxLength" ||
    constraint.constraintKind === "maxItems"
  );
}

function pathKey(constraint: ConstraintNode): string {
  return constraint.path?.segments.join(".") ?? "";
}

function isLowerBoundKind(kind: OrderedBoundKind): boolean {
  return (
    kind === "minimum" ||
    kind === "exclusiveMinimum" ||
    kind === "minLength" ||
    kind === "minItems"
  );
}

function describeConstraintTag(constraint: OrderedBoundConstraint): string {
  return `@${constraint.constraintKind}`;
}

function checkConstraintBroadening(
  ctx: ValidationContext,
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const strongestByKey = new Map<string, OrderedBoundConstraint>();

  for (const constraint of constraints) {
    if (!isOrderedBoundConstraint(constraint)) {
      continue;
    }

    const key = `${constraint.constraintKind}:${pathKey(constraint)}`;
    const previous = strongestByKey.get(key);
    if (previous === undefined) {
      strongestByKey.set(key, constraint);
      continue;
    }

    const broadens = isLowerBoundKind(constraint.constraintKind)
      ? constraint.value < previous.value
      : constraint.value > previous.value;

    if (broadens) {
      addConstraintBroadening(
        ctx,
        `Field "${fieldName}": ${describeConstraintTag(constraint)} (${String(constraint.value)}) is broader than earlier ${describeConstraintTag(previous)} (${String(previous.value)}). Constraints can only narrow.`,
        constraint.provenance,
        previous.provenance
      );
      continue;
    }

    const previousIsStronger = isLowerBoundKind(constraint.constraintKind)
      ? previous.value >= constraint.value
      : previous.value <= constraint.value;

    if (previousIsStronger) {
      continue;
    }

    strongestByKey.set(key, constraint);
  }
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
    case "record":
      return "record";
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

type PathTargetResolution =
  | { readonly kind: "resolved"; readonly type: TypeNode }
  | { readonly kind: "missing-property"; readonly segment: string }
  | { readonly kind: "unresolvable"; readonly type: TypeNode };

function dereferenceType(ctx: ValidationContext, type: TypeNode): TypeNode {
  let current = type;
  const seen = new Set<string>();

  while (current.kind === "reference") {
    if (seen.has(current.name)) {
      return current;
    }
    seen.add(current.name);

    const definition = ctx.typeRegistry[current.name];
    if (definition === undefined) {
      return current;
    }

    current = definition.type;
  }

  return current;
}

function resolvePathTargetType(
  ctx: ValidationContext,
  type: TypeNode,
  segments: readonly string[]
): PathTargetResolution {
  const effectiveType = dereferenceType(ctx, type);

  if (segments.length === 0) {
    return { kind: "resolved", type: effectiveType };
  }

  if (effectiveType.kind === "array") {
    return resolvePathTargetType(ctx, effectiveType.items, segments);
  }

  if (effectiveType.kind === "object") {
    const [segment, ...rest] = segments;
    if (segment === undefined) {
      throw new Error("Invariant violation: object path traversal requires a segment");
    }
    const property = effectiveType.properties.find((prop) => prop.name === segment);
    if (property === undefined) {
      return { kind: "missing-property", segment };
    }
    return resolvePathTargetType(ctx, property.type, rest);
  }

  return { kind: "unresolvable", type: effectiveType };
}

function formatPathTargetFieldName(fieldName: string, path: readonly string[]): string {
  return path.length === 0 ? fieldName : `${fieldName}.${path.join(".")}`;
}

function checkConstraintOnType(
  ctx: ValidationContext,
  fieldName: string,
  type: TypeNode,
  constraint: ConstraintNode
): void {
  const effectiveType = dereferenceType(ctx, type);
  const isNumber = effectiveType.kind === "primitive" && effectiveType.primitiveKind === "number";
  const isString = effectiveType.kind === "primitive" && effectiveType.primitiveKind === "string";
  const isArray = effectiveType.kind === "array";
  const isEnum = effectiveType.kind === "enum";

  const label = typeLabel(effectiveType);

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
      checkCustomConstraint(ctx, fieldName, effectiveType, constraint);
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

function checkTypeApplicability(
  ctx: ValidationContext,
  fieldName: string,
  type: TypeNode,
  constraints: readonly ConstraintNode[]
): void {
  for (const constraint of constraints) {
    // Path-targeted constraints (e.g., `@Minimum :value 0`) target a sub-field,
    // not the field itself. Resolve the target path and validate against the
    // resolved target type.
    if (constraint.path) {
      const resolution = resolvePathTargetType(ctx, type, constraint.path.segments);
      const targetFieldName = formatPathTargetFieldName(fieldName, constraint.path.segments);

      if (resolution.kind === "missing-property") {
        addTypeMismatch(
          ctx,
          `Field "${fieldName}": path-targeted constraint "${constraint.constraintKind}" references unknown path segment "${resolution.segment}"`,
          constraint.provenance
        );
        continue;
      }

      if (resolution.kind === "unresolvable") {
        addTypeMismatch(
          ctx,
          `Field "${targetFieldName}": path-targeted constraint "${constraint.constraintKind}" is invalid because type "${typeLabel(resolution.type)}" cannot be traversed`,
          constraint.provenance
        );
        continue;
      }

      checkConstraintOnType(ctx, targetFieldName, resolution.type, constraint);
      continue;
    }

    checkConstraintOnType(ctx, fieldName, type, constraint);
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
  checkConstraintBroadening(ctx, name, constraints);
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
    extensionRegistry: options?.extensionRegistry,
    typeRegistry: ir.typeRegistry,
  };

  for (const element of ir.elements) {
    validateElement(ctx, element);
  }

  return {
    diagnostics: ctx.diagnostics,
    valid: ctx.diagnostics.every((d) => d.severity !== "error"),
  };
}
