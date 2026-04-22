import type {
  AnnotationNode,
  ConstraintNode,
  CustomConstraintNode,
  JsonValue,
  ObjectProperty,
  PathTarget,
  Provenance,
  TypeNode,
} from "@formspec/core/internals";
import { normalizeConstraintTagName } from "@formspec/core/internals";
import { jsonValueEquals } from "./json-value.js";
type ConstraintDiagnosticSeverity = "error" | "warning";

export interface AnalysisTypeDefinition {
  readonly name: string;
  readonly type: TypeNode;
  readonly constraints?: readonly ConstraintNode[];
  readonly annotations?: readonly AnnotationNode[];
  readonly provenance: Provenance;
}

export type AnalysisTypeRegistry = Record<string, AnalysisTypeDefinition>;

export interface EffectiveTargetState {
  readonly fieldName: string;
  readonly path: PathTarget | null;
  readonly targetName: string;
  readonly type: TypeNode;
  readonly inheritedConstraints: readonly ConstraintNode[];
  readonly inheritedAnnotations: readonly AnnotationNode[];
  readonly localConstraints: readonly ConstraintNode[];
  readonly effectiveConstraints: readonly ConstraintNode[];
}

export type ResolvedTargetState =
  | ({ readonly kind: "resolved" } & EffectiveTargetState)
  | {
      readonly kind: "missing-property";
      readonly fieldName: string;
      readonly path: PathTarget;
      readonly targetName: string;
      readonly segment: string;
      readonly localConstraints: readonly ConstraintNode[];
    }
  | {
      readonly kind: "unresolvable";
      readonly fieldName: string;
      readonly path: PathTarget;
      readonly targetName: string;
      readonly type: TypeNode;
      readonly localConstraints: readonly ConstraintNode[];
    };

export interface ConstraintSemanticDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: ConstraintDiagnosticSeverity;
  readonly primaryLocation: Provenance;
  readonly relatedLocations: readonly Provenance[];
}

export interface ConstraintTargetAnalysisResult {
  readonly diagnostics: readonly ConstraintSemanticDiagnostic[];
  readonly targetStates: readonly ResolvedTargetState[];
}

export interface ConstraintSemanticRoleLike {
  readonly family: string;
  readonly bound: "lower" | "upper" | "exact";
  readonly inclusive: boolean;
}

export interface ConstraintRegistrationLike {
  readonly constraintName: string;
  readonly applicableTypes: readonly TypeNode["kind"][] | null;
  readonly isApplicableToType?: (type: TypeNode) => boolean;
  readonly comparePayloads?: (left: JsonValue, right: JsonValue) => number;
  readonly semanticRole?: ConstraintSemanticRoleLike;
}

export interface ConstraintTagRegistrationLike {
  readonly tagName: string;
  readonly constraintName: string;
  readonly isApplicableToType?: (type: TypeNode) => boolean;
}

export interface ConstraintRegistryLike {
  findConstraint(constraintId: string): ConstraintRegistrationLike | undefined;
  findConstraintTag(
    tagName: string
  ):
    | { readonly extensionId: string; readonly registration: ConstraintTagRegistrationLike }
    | undefined;
  findBuiltinConstraintBroadening?(
    typeId: string,
    tagName: string
  ): { readonly extensionId: string; readonly registration: unknown } | undefined;
}

function pathKey(path: PathTarget | null): string {
  return path?.segments.join(".") ?? "";
}

export function formatConstraintTargetName(fieldName: string, path: PathTarget | null): string {
  if (path === null || path.segments.length === 0) {
    return fieldName;
  }
  return `${fieldName}.${path.segments.join(".")}`;
}

export function dereferenceAnalysisType(
  type: TypeNode,
  typeRegistry: AnalysisTypeRegistry
): TypeNode {
  let current = type;
  const seen = new Set<string>();

  while (current.kind === "reference") {
    if (seen.has(current.name)) {
      return current;
    }
    seen.add(current.name);

    const definition = typeRegistry[current.name];
    if (definition === undefined) {
      return current;
    }
    current = definition.type;
  }

  return current;
}

export function collectReferencedTypeConstraints(
  type: TypeNode,
  typeRegistry: AnalysisTypeRegistry
): readonly ConstraintNode[] {
  const collected: ConstraintNode[] = [];
  let current = type;
  const seen = new Set<string>();

  while (current.kind === "reference") {
    if (seen.has(current.name)) {
      break;
    }
    seen.add(current.name);

    const definition = typeRegistry[current.name];
    if (definition === undefined) {
      break;
    }

    if (definition.constraints !== undefined) {
      collected.push(...definition.constraints);
    }

    current = definition.type;
  }

  return collected;
}

export function collectReferencedTypeAnnotations(
  type: TypeNode,
  typeRegistry: AnalysisTypeRegistry
): readonly AnnotationNode[] {
  const collected: AnnotationNode[] = [];
  let current = type;
  const seen = new Set<string>();

  while (current.kind === "reference") {
    if (seen.has(current.name)) {
      break;
    }
    seen.add(current.name);

    const definition = typeRegistry[current.name];
    if (definition === undefined) {
      break;
    }

    if (definition.annotations !== undefined) {
      collected.push(...definition.annotations);
    }

    current = definition.type;
  }

  return collected;
}

function resolveProperty(
  type: TypeNode,
  typeRegistry: AnalysisTypeRegistry,
  segments: readonly string[]
):
  | {
      readonly kind: "resolved";
      readonly property: ObjectProperty | null;
      readonly rawType: TypeNode;
      readonly type: TypeNode;
    }
  | { readonly kind: "missing-property"; readonly segment: string }
  | { readonly kind: "unresolvable"; readonly type: TypeNode } {
  const effectiveType = dereferenceAnalysisType(type, typeRegistry);

  if (segments.length === 0) {
    return { kind: "resolved", property: null, rawType: type, type: effectiveType };
  }

  if (effectiveType.kind === "array") {
    return resolveProperty(effectiveType.items, typeRegistry, segments);
  }

  if (effectiveType.kind !== "object") {
    return { kind: "unresolvable", type: effectiveType };
  }

  const [segment, ...rest] = segments;
  if (segment === undefined) {
    throw new Error("Invariant violation: object traversal requires a segment");
  }

  const property = effectiveType.properties.find((candidate) => candidate.name === segment);
  if (property === undefined) {
    return { kind: "missing-property", segment };
  }

  if (rest.length === 0) {
    return {
      kind: "resolved",
      property,
      rawType: property.type,
      type: dereferenceAnalysisType(property.type, typeRegistry),
    };
  }

  return resolveProperty(property.type, typeRegistry, rest);
}

export function resolveConstraintTargetState(
  fieldName: string,
  fieldType: TypeNode,
  path: PathTarget | null,
  localConstraints: readonly ConstraintNode[],
  typeRegistry: AnalysisTypeRegistry
): ResolvedTargetState {
  if (path === null) {
    const inheritedConstraints = collectReferencedTypeConstraints(fieldType, typeRegistry);
    const inheritedAnnotations = collectReferencedTypeAnnotations(fieldType, typeRegistry);
    const type = dereferenceAnalysisType(fieldType, typeRegistry);

    return {
      kind: "resolved",
      fieldName,
      path,
      targetName: fieldName,
      type,
      inheritedConstraints,
      inheritedAnnotations,
      localConstraints,
      effectiveConstraints: [...inheritedConstraints, ...localConstraints],
    };
  }

  const resolution = resolveProperty(fieldType, typeRegistry, path.segments);
  const targetName = formatConstraintTargetName(fieldName, path);

  if (resolution.kind === "missing-property") {
    return {
      kind: "missing-property",
      fieldName,
      path,
      targetName,
      segment: resolution.segment,
      localConstraints,
    };
  }

  if (resolution.kind === "unresolvable") {
    return {
      kind: "unresolvable",
      fieldName,
      path,
      targetName,
      type: resolution.type,
      localConstraints,
    };
  }

  const propertyConstraints = resolution.property?.constraints ?? [];
  const propertyAnnotations = resolution.property?.annotations ?? [];
  const referencedConstraints = collectReferencedTypeConstraints(resolution.rawType, typeRegistry);
  const referencedAnnotations = collectReferencedTypeAnnotations(resolution.rawType, typeRegistry);
  const inheritedConstraints = [...propertyConstraints, ...referencedConstraints];
  const inheritedAnnotations = [...propertyAnnotations, ...referencedAnnotations];

  return {
    kind: "resolved",
    fieldName,
    path,
    targetName,
    type: resolution.type,
    inheritedConstraints,
    inheritedAnnotations,
    localConstraints,
    effectiveConstraints: [...inheritedConstraints, ...localConstraints],
  };
}

function cloneTargetPath(path: PathTarget | undefined): PathTarget | null {
  if (path === undefined) {
    return null;
  }
  return { segments: [...path.segments] };
}

export function buildConstraintTargetStates(
  fieldName: string,
  fieldType: TypeNode,
  constraints: readonly ConstraintNode[],
  typeRegistry: AnalysisTypeRegistry
): readonly ResolvedTargetState[] {
  const grouped = new Map<string, { path: PathTarget | null; constraints: ConstraintNode[] }>([
    ["", { path: null, constraints: [] }],
  ]);

  for (const constraint of constraints) {
    const path = cloneTargetPath(constraint.path);
    const key = pathKey(path);
    let bucket = grouped.get(key);
    if (bucket === undefined) {
      bucket = { path, constraints: [] };
      grouped.set(key, bucket);
    }
    bucket.constraints.push(constraint);
  }

  return [...grouped.values()].map((group) =>
    resolveConstraintTargetState(fieldName, fieldType, group.path, group.constraints, typeRegistry)
  );
}

function addContradiction(
  diagnostics: ConstraintSemanticDiagnostic[],
  message: string,
  primary: Provenance,
  related: Provenance
): void {
  diagnostics.push({
    code: "CONTRADICTING_CONSTRAINTS",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [related],
  });
}

function addTypeMismatch(
  diagnostics: ConstraintSemanticDiagnostic[],
  message: string,
  primary: Provenance
): void {
  diagnostics.push({
    code: "TYPE_MISMATCH",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addUnknownExtension(
  diagnostics: ConstraintSemanticDiagnostic[],
  message: string,
  primary: Provenance
): void {
  diagnostics.push({
    code: "UNKNOWN_EXTENSION",
    message,
    severity: "warning",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addUnknownPathTarget(
  diagnostics: ConstraintSemanticDiagnostic[],
  message: string,
  primary: Provenance
): void {
  diagnostics.push({
    code: "UNKNOWN_PATH_TARGET",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [],
  });
}

function addConstraintBroadening(
  diagnostics: ConstraintSemanticDiagnostic[],
  message: string,
  primary: Provenance,
  related: Provenance
): void {
  diagnostics.push({
    code: "CONSTRAINT_BROADENING",
    message,
    severity: "error",
    primaryLocation: primary,
    relatedLocations: [related],
  });
}

function getExtensionIdFromConstraintId(constraintId: string): string | null {
  const separator = constraintId.lastIndexOf("/");
  if (separator <= 0) {
    return null;
  }
  return constraintId.slice(0, separator);
}

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
      const exhaustive: never = type;
      return String(exhaustive);
    }
  }
}

type NumericConstraintKind =
  | "minimum"
  | "maximum"
  | "exclusiveMinimum"
  | "exclusiveMaximum"
  | "multipleOf";

type LengthConstraintKind = "minLength" | "maxLength" | "minItems" | "maxItems";

function findNumeric(
  constraints: readonly ConstraintNode[],
  constraintKind: NumericConstraintKind
): Extract<ConstraintNode, { readonly constraintKind: NumericConstraintKind }> | undefined {
  return constraints.find(
    (
      constraint
    ): constraint is Extract<ConstraintNode, { readonly constraintKind: NumericConstraintKind }> =>
      constraint.constraintKind === constraintKind
  );
}

function findLength(
  constraints: readonly ConstraintNode[],
  constraintKind: LengthConstraintKind
): Extract<ConstraintNode, { readonly constraintKind: LengthConstraintKind }> | undefined {
  return constraints.find(
    (
      constraint
    ): constraint is Extract<ConstraintNode, { readonly constraintKind: LengthConstraintKind }> =>
      constraint.constraintKind === constraintKind
  );
}

function findAllowedMembers(
  constraints: readonly ConstraintNode[]
): readonly Extract<ConstraintNode, { readonly constraintKind: "allowedMembers" }>[] {
  return constraints.filter(
    (
      constraint
    ): constraint is Extract<ConstraintNode, { readonly constraintKind: "allowedMembers" }> =>
      constraint.constraintKind === "allowedMembers"
  );
}

function findConstConstraints(
  constraints: readonly ConstraintNode[]
): readonly Extract<ConstraintNode, { readonly constraintKind: "const" }>[] {
  return constraints.filter(
    (constraint): constraint is Extract<ConstraintNode, { readonly constraintKind: "const" }> =>
      constraint.constraintKind === "const"
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

type OrderedBoundConstraint = Extract<
  ConstraintNode,
  { readonly constraintKind: OrderedBoundKind }
>;

type OrderedBoundFamily =
  | "numeric-lower"
  | "numeric-upper"
  | "minLength"
  | "minItems"
  | "maxLength"
  | "maxItems";

function isOrderedBoundConstraint(
  constraint: ConstraintNode
): constraint is OrderedBoundConstraint {
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

function constraintPathKey(constraint: ConstraintNode): string {
  return constraint.path?.segments.join(".") ?? "";
}

function orderedBoundFamily(kind: OrderedBoundKind): OrderedBoundFamily {
  switch (kind) {
    case "minimum":
    case "exclusiveMinimum":
      return "numeric-lower";
    case "maximum":
    case "exclusiveMaximum":
      return "numeric-upper";
    case "minLength":
      return "minLength";
    case "minItems":
      return "minItems";
    case "maxLength":
      return "maxLength";
    case "maxItems":
      return "maxItems";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function isNumericLowerKind(kind: OrderedBoundKind): kind is "minimum" | "exclusiveMinimum" {
  return kind === "minimum" || kind === "exclusiveMinimum";
}

function isNumericUpperKind(kind: OrderedBoundKind): kind is "maximum" | "exclusiveMaximum" {
  return kind === "maximum" || kind === "exclusiveMaximum";
}

function describeConstraintTag(constraint: OrderedBoundConstraint): string {
  return `@${constraint.constraintKind}`;
}

function compareConstraintStrength(
  current: OrderedBoundConstraint,
  previous: OrderedBoundConstraint
): number {
  const family = orderedBoundFamily(current.constraintKind);

  if (family === "numeric-lower") {
    if (
      !isNumericLowerKind(current.constraintKind) ||
      !isNumericLowerKind(previous.constraintKind)
    ) {
      throw new Error("numeric-lower family received non-numeric lower-bound constraint");
    }

    if (current.value !== previous.value) {
      return current.value > previous.value ? 1 : -1;
    }
    if (current.constraintKind === "exclusiveMinimum" && previous.constraintKind === "minimum") {
      return 1;
    }
    if (current.constraintKind === "minimum" && previous.constraintKind === "exclusiveMinimum") {
      return -1;
    }
    return 0;
  }

  if (family === "numeric-upper") {
    if (
      !isNumericUpperKind(current.constraintKind) ||
      !isNumericUpperKind(previous.constraintKind)
    ) {
      throw new Error("numeric-upper family received non-numeric upper-bound constraint");
    }

    if (current.value !== previous.value) {
      return current.value < previous.value ? 1 : -1;
    }
    if (current.constraintKind === "exclusiveMaximum" && previous.constraintKind === "maximum") {
      return 1;
    }
    if (current.constraintKind === "maximum" && previous.constraintKind === "exclusiveMaximum") {
      return -1;
    }
    return 0;
  }

  switch (family) {
    case "minLength":
    case "minItems":
      if (current.value === previous.value) {
        return 0;
      }
      return current.value > previous.value ? 1 : -1;
    case "maxLength":
    case "maxItems":
      if (current.value === previous.value) {
        return 0;
      }
      return current.value < previous.value ? 1 : -1;
    default: {
      const exhaustive: never = family;
      return exhaustive;
    }
  }
}

interface CustomSemanticEntry {
  readonly constraint: CustomConstraintNode;
  readonly comparePayloads: NonNullable<ConstraintRegistrationLike["comparePayloads"]>;
  readonly role: NonNullable<ConstraintRegistrationLike["semanticRole"]>;
}

function compareSemanticInclusivity(currentInclusive: boolean, previousInclusive: boolean): number {
  if (currentInclusive === previousInclusive) {
    return 0;
  }
  return currentInclusive ? -1 : 1;
}

function compareCustomConstraintStrength(
  current: CustomSemanticEntry,
  previous: CustomSemanticEntry
): number {
  const order = current.comparePayloads(current.constraint.payload, previous.constraint.payload);
  const equalPayloadTiebreaker =
    order === 0
      ? compareSemanticInclusivity(current.role.inclusive, previous.role.inclusive)
      : order;

  switch (current.role.bound) {
    case "lower":
      return equalPayloadTiebreaker;
    case "upper":
      return equalPayloadTiebreaker === 0 ? 0 : -equalPayloadTiebreaker;
    case "exact":
      return order === 0 ? 0 : Number.NaN;
    default: {
      const exhaustive: never = current.role.bound;
      return exhaustive;
    }
  }
}

function customConstraintsContradict(
  lower: CustomSemanticEntry,
  upper: CustomSemanticEntry
): boolean {
  const order = lower.comparePayloads(lower.constraint.payload, upper.constraint.payload);
  if (order > 0) {
    return true;
  }
  if (order < 0) {
    return false;
  }
  return !lower.role.inclusive || !upper.role.inclusive;
}

function describeCustomConstraintTag(constraint: CustomConstraintNode): string {
  return constraint.provenance.tagName ?? constraint.constraintId;
}

function isNullType(type: TypeNode): boolean {
  return type.kind === "primitive" && type.primitiveKind === "null";
}

function collectCustomConstraintCandidateTypes(
  type: TypeNode,
  typeRegistry: AnalysisTypeRegistry
): readonly TypeNode[] {
  const effectiveType = dereferenceAnalysisType(type, typeRegistry);
  const candidates: TypeNode[] = [effectiveType];

  if (effectiveType.kind === "array") {
    candidates.push(...collectCustomConstraintCandidateTypes(effectiveType.items, typeRegistry));
  }

  if (effectiveType.kind === "union") {
    const memberTypes = effectiveType.members.map((member) =>
      dereferenceAnalysisType(member, typeRegistry)
    );
    const nonNullMembers = memberTypes.filter((member) => !isNullType(member));

    if (nonNullMembers.length === 1 && nonNullMembers.length < memberTypes.length) {
      const [nullableMember] = nonNullMembers;
      if (nullableMember !== undefined) {
        candidates.push(...collectCustomConstraintCandidateTypes(nullableMember, typeRegistry));
      }
    }
  }

  return candidates;
}

function checkNumericContradictions(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const min = findNumeric(constraints, "minimum");
  const max = findNumeric(constraints, "maximum");
  const exMin = findNumeric(constraints, "exclusiveMinimum");
  const exMax = findNumeric(constraints, "exclusiveMaximum");

  if (min !== undefined && max !== undefined && min.value > max.value) {
    addContradiction(
      diagnostics,
      `Field "${fieldName}": minimum (${String(min.value)}) is greater than maximum (${String(max.value)})`,
      min.provenance,
      max.provenance
    );
  }

  if (exMin !== undefined && max !== undefined && exMin.value >= max.value) {
    addContradiction(
      diagnostics,
      `Field "${fieldName}": exclusiveMinimum (${String(exMin.value)}) is greater than or equal to maximum (${String(max.value)})`,
      exMin.provenance,
      max.provenance
    );
  }

  if (min !== undefined && exMax !== undefined && min.value >= exMax.value) {
    addContradiction(
      diagnostics,
      `Field "${fieldName}": minimum (${String(min.value)}) is greater than or equal to exclusiveMaximum (${String(exMax.value)})`,
      min.provenance,
      exMax.provenance
    );
  }

  if (exMin !== undefined && exMax !== undefined && exMin.value >= exMax.value) {
    addContradiction(
      diagnostics,
      `Field "${fieldName}": exclusiveMinimum (${String(exMin.value)}) is greater than or equal to exclusiveMaximum (${String(exMax.value)})`,
      exMin.provenance,
      exMax.provenance
    );
  }
}

function checkLengthContradictions(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const minLen = findLength(constraints, "minLength");
  const maxLen = findLength(constraints, "maxLength");

  if (minLen !== undefined && maxLen !== undefined && minLen.value > maxLen.value) {
    addContradiction(
      diagnostics,
      `Field "${fieldName}": minLength (${String(minLen.value)}) is greater than maxLength (${String(maxLen.value)})`,
      minLen.provenance,
      maxLen.provenance
    );
  }

  const minItems = findLength(constraints, "minItems");
  const maxItems = findLength(constraints, "maxItems");

  if (minItems !== undefined && maxItems !== undefined && minItems.value > maxItems.value) {
    addContradiction(
      diagnostics,
      `Field "${fieldName}": minItems (${String(minItems.value)}) is greater than maxItems (${String(maxItems.value)})`,
      minItems.provenance,
      maxItems.provenance
    );
  }
}

function checkAllowedMembersContradiction(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const members = findAllowedMembers(constraints);
  if (members.length < 2) {
    return;
  }

  const firstSet = new Set(members[0]?.members ?? []);
  for (let index = 1; index < members.length; index += 1) {
    const current = members[index];
    if (current === undefined) {
      continue;
    }

    for (const member of firstSet) {
      if (!current.members.includes(member)) {
        firstSet.delete(member);
      }
    }
  }

  if (firstSet.size === 0) {
    const first = members[0];
    const second = members[1];
    if (first !== undefined && second !== undefined) {
      addContradiction(
        diagnostics,
        `Field "${fieldName}": allowedMembers constraints have an empty intersection (no valid values remain)`,
        first.provenance,
        second.provenance
      );
    }
  }
}

function checkConstContradictions(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const constConstraints = findConstConstraints(constraints);
  if (constConstraints.length < 2) {
    return;
  }

  const first = constConstraints[0];
  if (first === undefined) {
    return;
  }

  for (let index = 1; index < constConstraints.length; index += 1) {
    const current = constConstraints[index];
    if (current === undefined || jsonValueEquals(first.value, current.value)) {
      continue;
    }

    addContradiction(
      diagnostics,
      `Field "${fieldName}": conflicting @const constraints require both ${JSON.stringify(first.value)} and ${JSON.stringify(current.value)}`,
      first.provenance,
      current.provenance
    );
  }
}

function checkConstraintBroadening(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  constraints: readonly ConstraintNode[]
): void {
  const strongestByKey = new Map<string, OrderedBoundConstraint>();

  for (const constraint of constraints) {
    if (!isOrderedBoundConstraint(constraint)) {
      continue;
    }

    const key = `${orderedBoundFamily(constraint.constraintKind)}:${constraintPathKey(constraint)}`;
    const previous = strongestByKey.get(key);
    if (previous === undefined) {
      strongestByKey.set(key, constraint);
      continue;
    }

    const strength = compareConstraintStrength(constraint, previous);
    if (strength < 0) {
      addConstraintBroadening(
        diagnostics,
        `Field "${fieldName}": ${describeConstraintTag(constraint)} (${String(constraint.value)}) is broader than earlier ${describeConstraintTag(previous)} (${String(previous.value)}). Constraints can only narrow.`,
        constraint.provenance,
        previous.provenance
      );
      continue;
    }

    if (strength > 0) {
      strongestByKey.set(key, constraint);
    }
  }
}

function checkCustomConstraintSemantics(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  constraints: readonly ConstraintNode[],
  extensionRegistry: ConstraintRegistryLike | undefined
): void {
  if (extensionRegistry === undefined) {
    return;
  }

  const strongestByKey = new Map<string, CustomSemanticEntry>();
  const lowerByFamily = new Map<string, CustomSemanticEntry>();
  const upperByFamily = new Map<string, CustomSemanticEntry>();

  for (const constraint of constraints) {
    if (constraint.constraintKind !== "custom") {
      continue;
    }

    const registration = extensionRegistry.findConstraint(constraint.constraintId);
    if (registration?.comparePayloads === undefined || registration.semanticRole === undefined) {
      continue;
    }

    const entry: CustomSemanticEntry = {
      constraint,
      comparePayloads: registration.comparePayloads,
      role: registration.semanticRole,
    };
    const familyKey = `${registration.semanticRole.family}:${constraintPathKey(constraint)}`;
    const boundKey = `${familyKey}:${registration.semanticRole.bound}`;
    const previous = strongestByKey.get(boundKey);

    if (previous !== undefined) {
      const strength = compareCustomConstraintStrength(entry, previous);
      if (Number.isNaN(strength)) {
        addContradiction(
          diagnostics,
          `Field "${fieldName}": ${describeCustomConstraintTag(constraint)} conflicts with ${describeCustomConstraintTag(previous.constraint)}`,
          constraint.provenance,
          previous.constraint.provenance
        );
        continue;
      }

      if (strength < 0) {
        addConstraintBroadening(
          diagnostics,
          `Field "${fieldName}": ${describeCustomConstraintTag(constraint)} is broader than earlier ${describeCustomConstraintTag(previous.constraint)}. Constraints can only narrow.`,
          constraint.provenance,
          previous.constraint.provenance
        );
        continue;
      }

      if (strength > 0) {
        strongestByKey.set(boundKey, entry);
      }
    } else {
      strongestByKey.set(boundKey, entry);
    }

    if (registration.semanticRole.bound === "lower") {
      lowerByFamily.set(familyKey, strongestByKey.get(boundKey) ?? entry);
    } else if (registration.semanticRole.bound === "upper") {
      upperByFamily.set(familyKey, strongestByKey.get(boundKey) ?? entry);
    }
  }

  for (const [familyKey, lower] of lowerByFamily) {
    const upper = upperByFamily.get(familyKey);
    if (upper === undefined || !customConstraintsContradict(lower, upper)) {
      continue;
    }

    addContradiction(
      diagnostics,
      `Field "${fieldName}": ${describeCustomConstraintTag(lower.constraint)} contradicts ${describeCustomConstraintTag(upper.constraint)}`,
      lower.constraint.provenance,
      upper.constraint.provenance
    );
  }
}

function checkCustomConstraint(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  type: TypeNode,
  constraint: CustomConstraintNode,
  typeRegistry: AnalysisTypeRegistry,
  extensionRegistry: ConstraintRegistryLike | undefined
): void {
  if (extensionRegistry === undefined) {
    return;
  }

  const registration = extensionRegistry.findConstraint(constraint.constraintId);

  if (registration === undefined) {
    addUnknownExtension(
      diagnostics,
      `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not registered in the extension registry`,
      constraint.provenance
    );
    return;
  }

  const candidateTypes = collectCustomConstraintCandidateTypes(type, typeRegistry);
  const normalizedTagName =
    constraint.provenance.tagName === undefined
      ? undefined
      : normalizeConstraintTagName(constraint.provenance.tagName.replace(/^@/, ""));

  if (normalizedTagName !== undefined) {
    const tagRegistration = extensionRegistry.findConstraintTag(normalizedTagName);
    const extensionId = getExtensionIdFromConstraintId(constraint.constraintId);
    if (
      extensionId !== null &&
      tagRegistration?.extensionId === extensionId &&
      tagRegistration.registration.constraintName === registration.constraintName &&
      !candidateTypes.some(
        (candidateType) =>
          tagRegistration.registration.isApplicableToType?.(candidateType) !== false
      )
    ) {
      addTypeMismatch(
        diagnostics,
        `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not applicable to type "${typeLabel(type)}"`,
        constraint.provenance
      );
      return;
    }
  }

  if (registration.applicableTypes === null) {
    if (
      !candidateTypes.some(
        (candidateType) => registration.isApplicableToType?.(candidateType) !== false
      )
    ) {
      addTypeMismatch(
        diagnostics,
        `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not applicable to type "${typeLabel(type)}"`,
        constraint.provenance
      );
    }
    return;
  }

  const applicableTypes = registration.applicableTypes;
  const matchesApplicableType = candidateTypes.some(
    (candidateType) =>
      applicableTypes.includes(candidateType.kind) &&
      registration.isApplicableToType?.(candidateType) !== false
  );

  if (!matchesApplicableType) {
    addTypeMismatch(
      diagnostics,
      `Field "${fieldName}": custom constraint "${constraint.constraintId}" is not applicable to type "${typeLabel(type)}"`,
      constraint.provenance
    );
  }
}

function checkConstraintOnType(
  diagnostics: ConstraintSemanticDiagnostic[],
  fieldName: string,
  type: TypeNode,
  constraint: ConstraintNode,
  typeRegistry: AnalysisTypeRegistry,
  extensionRegistry: ConstraintRegistryLike | undefined
): void {
  const effectiveType = dereferenceAnalysisType(type, typeRegistry);
  // For nullable unions (e.g. Integer | null), unwrap to the non-null member
  // so that constraint compatibility checks work the same as for the non-null
  // variant. This mirrors the stripNullishUnion pattern used in ts-binding.ts.
  const unwrapped =
    effectiveType.kind === "union"
      ? (() => {
          const nonNull = effectiveType.members
            .map((m) => dereferenceAnalysisType(m, typeRegistry))
            .filter((m) => !isNullType(m));
          return nonNull.length === 1 && nonNull[0] !== undefined ? nonNull[0] : effectiveType;
        })()
      : effectiveType;
  const isNumber =
    unwrapped.kind === "primitive" &&
    ["number", "integer", "bigint"].includes(unwrapped.primitiveKind);
  const isString = unwrapped.kind === "primitive" && unwrapped.primitiveKind === "string";
  const isArray = unwrapped.kind === "array";
  const isEnum = unwrapped.kind === "enum";
  const arrayItemType =
    unwrapped.kind === "array" ? dereferenceAnalysisType(unwrapped.items, typeRegistry) : undefined;
  const isStringArray =
    arrayItemType?.kind === "primitive" && arrayItemType.primitiveKind === "string";

  const label = typeLabel(effectiveType);

  // Check if a custom type has a builtin constraint broadening registered,
  // which allows built-in constraints (e.g., @minimum) on non-numeric types.
  // Also handles nullable unions (e.g., Decimal | null) by checking non-null members.
  const hasBroadening = (tagName: string): boolean => {
    if (extensionRegistry?.findBuiltinConstraintBroadening === undefined) {
      return false;
    }
    if (effectiveType.kind === "custom") {
      return (
        extensionRegistry.findBuiltinConstraintBroadening(effectiveType.typeId, tagName) !==
        undefined
      );
    }
    if (effectiveType.kind === "union") {
      return effectiveType.members.some((member) => {
        // Skip null members — they don't affect constraint applicability
        if (member.kind === "primitive" && member.primitiveKind === "null") {
          return false;
        }
        const resolvedMember = dereferenceAnalysisType(member, typeRegistry);
        if (resolvedMember.kind !== "custom") {
          return false;
        }
        // extensionRegistry and findBuiltinConstraintBroadening are both defined
        // (narrowed by the outer guard), but TypeScript can't narrow optional
        // methods across closure boundaries — this is a safe call.
        return (
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded above
          extensionRegistry.findBuiltinConstraintBroadening!(resolvedMember.typeId, tagName) !==
          undefined
        );
      });
    }
    return false;
  };

  switch (constraint.constraintKind) {
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
    case "multipleOf":
      if (!isNumber && !hasBroadening(constraint.constraintKind)) {
        addTypeMismatch(
          diagnostics,
          `Field "${fieldName}": constraint "${constraint.constraintKind}" is only valid on number fields, but field type is "${label}"`,
          constraint.provenance
        );
      }
      break;
    case "minLength":
    case "maxLength":
    case "pattern":
      if (!isString && !isStringArray) {
        addTypeMismatch(
          diagnostics,
          `Field "${fieldName}": constraint "${constraint.constraintKind}" is only valid on string fields or string array items, but field type is "${label}"`,
          constraint.provenance
        );
      }
      break;
    case "minItems":
    case "maxItems":
    case "uniqueItems":
      if (!isArray) {
        addTypeMismatch(
          diagnostics,
          `Field "${fieldName}": constraint "${constraint.constraintKind}" is only valid on array fields, but field type is "${label}"`,
          constraint.provenance
        );
      }
      break;
    case "allowedMembers":
      if (!isEnum) {
        addTypeMismatch(
          diagnostics,
          `Field "${fieldName}": constraint "allowedMembers" is only valid on enum fields, but field type is "${label}"`,
          constraint.provenance
        );
      }
      break;
    case "const": {
      const isPrimitiveConstType =
        (effectiveType.kind === "primitive" &&
          ["string", "number", "integer", "bigint", "boolean", "null"].includes(
            effectiveType.primitiveKind
          )) ||
        effectiveType.kind === "enum";

      if (!isPrimitiveConstType) {
        addTypeMismatch(
          diagnostics,
          `Field "${fieldName}": constraint "const" is only valid on primitive or enum fields, but field type is "${label}"`,
          constraint.provenance
        );
        break;
      }

      if (effectiveType.kind === "primitive") {
        const valueType =
          constraint.value === null
            ? "null"
            : Array.isArray(constraint.value)
              ? "array"
              : typeof constraint.value;
        const expectedValueType =
          effectiveType.primitiveKind === "integer" || effectiveType.primitiveKind === "bigint"
            ? "number"
            : effectiveType.primitiveKind;
        if (valueType !== expectedValueType) {
          addTypeMismatch(
            diagnostics,
            `Field "${fieldName}": @const value type "${valueType}" is incompatible with field type "${effectiveType.primitiveKind}"`,
            constraint.provenance
          );
        }
        break;
      }

      const memberValues = effectiveType.members.map((member) => member.value);
      if (!memberValues.some((member) => jsonValueEquals(member, constraint.value))) {
        addTypeMismatch(
          diagnostics,
          `Field "${fieldName}": @const value ${JSON.stringify(constraint.value)} is not one of the enum members`,
          constraint.provenance
        );
      }
      break;
    }
    case "custom":
      checkCustomConstraint(
        diagnostics,
        fieldName,
        effectiveType,
        constraint,
        typeRegistry,
        extensionRegistry
      );
      break;
    default: {
      const exhaustive: never = constraint;
      throw new Error(`Unhandled constraint: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function analyzeResolvedTargetState(
  diagnostics: ConstraintSemanticDiagnostic[],
  state: Extract<ResolvedTargetState, { readonly kind: "resolved" }>,
  typeRegistry: AnalysisTypeRegistry,
  extensionRegistry: ConstraintRegistryLike | undefined
): void {
  checkNumericContradictions(diagnostics, state.targetName, state.effectiveConstraints);
  checkLengthContradictions(diagnostics, state.targetName, state.effectiveConstraints);
  checkAllowedMembersContradiction(diagnostics, state.targetName, state.effectiveConstraints);
  checkConstContradictions(diagnostics, state.targetName, state.effectiveConstraints);
  checkConstraintBroadening(diagnostics, state.targetName, state.effectiveConstraints);
  checkCustomConstraintSemantics(
    diagnostics,
    state.targetName,
    state.effectiveConstraints,
    extensionRegistry
  );

  for (const constraint of state.effectiveConstraints) {
    checkConstraintOnType(
      diagnostics,
      state.targetName,
      state.type,
      constraint,
      typeRegistry,
      extensionRegistry
    );
  }
}

/**
 * Resolves targeted constraints against a field type, producing effective
 * target states plus semantic diagnostics such as contradictions, unknown
 * paths, and type mismatches.
 */
export function analyzeConstraintTargets(
  fieldName: string,
  fieldType: TypeNode,
  constraints: readonly ConstraintNode[],
  typeRegistry: AnalysisTypeRegistry,
  options?: {
    readonly extensionRegistry?: ConstraintRegistryLike;
  }
): ConstraintTargetAnalysisResult {
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  const targetStates = buildConstraintTargetStates(fieldName, fieldType, constraints, typeRegistry);

  for (const targetState of targetStates) {
    switch (targetState.kind) {
      case "resolved":
        analyzeResolvedTargetState(
          diagnostics,
          targetState,
          typeRegistry,
          options?.extensionRegistry
        );
        break;
      case "missing-property":
        for (const constraint of targetState.localConstraints) {
          addUnknownPathTarget(
            diagnostics,
            `Field "${targetState.targetName}": path-targeted constraint "${constraint.constraintKind}" references unknown path segment "${targetState.segment}"`,
            constraint.provenance
          );
        }
        break;
      case "unresolvable":
        for (const constraint of targetState.localConstraints) {
          addTypeMismatch(
            diagnostics,
            `Field "${targetState.targetName}": path-targeted constraint "${constraint.constraintKind}" is invalid because type "${typeLabel(targetState.type)}" cannot be traversed`,
            constraint.provenance
          );
        }
        break;
      default: {
        const exhaustive: never = targetState;
        throw new Error(`Unhandled target state: ${String(exhaustive)}`);
      }
    }
  }

  return {
    diagnostics,
    targetStates,
  };
}
