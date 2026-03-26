/**
 * Class analyzer for extracting fields, types, and JSDoc constraints.
 *
 * Produces `IRClassAnalysis` containing `FieldNode[]` and `typeRegistry`
 * directly from class, interface, or type alias declarations.
 * All downstream generation routes through the canonical FormIR.
 */

import * as ts from "typescript";
import type {
  FieldNode,
  TypeNode,
  EnumTypeNode,
  ConstraintNode,
  AnnotationNode,
  Provenance,
  ObjectProperty,
  RecordTypeNode,
  TypeDefinition,
  JsonValue,
} from "@formspec/core";
import {
  extractJSDocConstraintNodes,
  extractJSDocAnnotationNodes,
  extractDefaultValueAnnotation,
} from "./jsdoc-constraints.js";

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for ts.ObjectType — checks that the TypeFlags.Object bit is set.
 */
function isObjectType(type: ts.Type): type is ts.ObjectType {
  return !!(type.flags & ts.TypeFlags.Object);
}

/**
 * Type guard for ts.TypeReference — checks ObjectFlags.Reference on top of ObjectType.
 * The internal `as` cast is isolated inside this guard and is required because
 * TypeScript's public API does not expose objectFlags on ts.Type directly.
 */
function isTypeReference(type: ts.Type): type is ts.TypeReference {
  // as cast is isolated inside type guard
  return (
    !!(type.flags & ts.TypeFlags.Object) &&
    !!((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference)
  );
}

// =============================================================================
// IR OUTPUT TYPES
// =============================================================================

/**
 * Layout metadata extracted from `@Group` and `@ShowWhen` TSDoc tags.
 * One entry per field, in the same order as `fields`.
 */
export interface FieldLayoutMetadata {
  /** Group label from `@Group("label")`, or undefined if ungrouped. */
  readonly groupLabel?: string;
  /** ShowWhen condition from `@ShowWhen({ field, value })`, or undefined if always visible. */
  readonly showWhen?: { readonly field: string; readonly value: JsonValue };
}

/**
 * Result of analyzing a class/interface/type alias into canonical IR.
 */
export interface IRClassAnalysis {
  /** Type name */
  readonly name: string;
  /** Analyzed fields as canonical IR FieldNodes */
  readonly fields: readonly FieldNode[];
  /** Layout metadata per field (same order/length as `fields`). */
  readonly fieldLayouts: readonly FieldLayoutMetadata[];
  /** Named type definitions referenced by fields */
  readonly typeRegistry: Record<string, TypeDefinition>;
  /** Instance methods (retained for downstream method-schema generation) */
  readonly instanceMethods: readonly MethodInfo[];
  /** Static methods */
  readonly staticMethods: readonly MethodInfo[];
}

/**
 * Result of analyzing a type alias into IR — either success or error.
 */
export type AnalyzeTypeAliasToIRResult =
  | { readonly ok: true; readonly analysis: IRClassAnalysis }
  | { readonly ok: false; readonly error: string };

// =============================================================================
// IR ANALYSIS — PUBLIC API
// =============================================================================

/**
 * Analyzes a class declaration and produces canonical IR FieldNodes.
 */
export function analyzeClassToIR(
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  file = ""
): IRClassAnalysis {
  const name = classDecl.name?.text ?? "AnonymousClass";
  const fields: FieldNode[] = [];
  const fieldLayouts: FieldLayoutMetadata[] = [];
  const typeRegistry: Record<string, TypeDefinition> = {};
  const visiting = new Set<ts.Type>();
  const instanceMethods: MethodInfo[] = [];
  const staticMethods: MethodInfo[] = [];

  for (const member of classDecl.members) {
    if (ts.isPropertyDeclaration(member)) {
      const fieldNode = analyzeFieldToIR(member, checker, file, typeRegistry, visiting);
      if (fieldNode) {
        fields.push(fieldNode);
        fieldLayouts.push({});
      }
    } else if (ts.isMethodDeclaration(member)) {
      const methodInfo = analyzeMethod(member, checker);
      if (methodInfo) {
        const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
        if (isStatic) {
          staticMethods.push(methodInfo);
        } else {
          instanceMethods.push(methodInfo);
        }
      }
    }
  }

  return { name, fields, fieldLayouts, typeRegistry, instanceMethods, staticMethods };
}

/**
 * Analyzes an interface declaration and produces canonical IR FieldNodes.
 */
export function analyzeInterfaceToIR(
  interfaceDecl: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  file = ""
): IRClassAnalysis {
  const name = interfaceDecl.name.text;
  const fields: FieldNode[] = [];
  const typeRegistry: Record<string, TypeDefinition> = {};
  const visiting = new Set<ts.Type>();

  for (const member of interfaceDecl.members) {
    if (ts.isPropertySignature(member)) {
      const fieldNode = analyzeInterfacePropertyToIR(member, checker, file, typeRegistry, visiting);
      if (fieldNode) {
        fields.push(fieldNode);
      }
    }
  }

  const fieldLayouts: FieldLayoutMetadata[] = fields.map(() => ({}));
  return { name, fields, fieldLayouts, typeRegistry, instanceMethods: [], staticMethods: [] };
}

/**
 * Analyzes a type alias declaration and produces canonical IR FieldNodes.
 */
export function analyzeTypeAliasToIR(
  typeAlias: ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  file = ""
): AnalyzeTypeAliasToIRResult {
  if (!ts.isTypeLiteralNode(typeAlias.type)) {
    const sourceFile = typeAlias.getSourceFile();
    const { line } = sourceFile.getLineAndCharacterOfPosition(typeAlias.getStart());
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- enum reverse mapping can be undefined for compiler-internal kinds
    const kindDesc = ts.SyntaxKind[typeAlias.type.kind] ?? "unknown";
    return {
      ok: false,
      error: `Type alias "${typeAlias.name.text}" at line ${String(line + 1)} is not an object type literal (found ${kindDesc})`,
    };
  }

  const name = typeAlias.name.text;
  const fields: FieldNode[] = [];
  const typeRegistry: Record<string, TypeDefinition> = {};
  const visiting = new Set<ts.Type>();

  for (const member of typeAlias.type.members) {
    if (ts.isPropertySignature(member)) {
      const fieldNode = analyzeInterfacePropertyToIR(member, checker, file, typeRegistry, visiting);
      if (fieldNode) {
        fields.push(fieldNode);
      }
    }
  }

  return {
    ok: true,
    analysis: {
      name,
      fields,
      fieldLayouts: fields.map(() => ({})),
      typeRegistry,
      instanceMethods: [],
      staticMethods: [],
    },
  };
}

// =============================================================================
// IR FIELD ANALYSIS — PRIVATE
// =============================================================================

/**
 * Analyzes a class property declaration into a canonical IR FieldNode.
 */
function analyzeFieldToIR(
  prop: ts.PropertyDeclaration,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): FieldNode | null {
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const tsType = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const provenance = provenanceForNode(prop, file);

  // Resolve ts.Type → TypeNode
  let type = resolveTypeNode(tsType, checker, file, typeRegistry, visiting);

  // Collect constraints
  const constraints: ConstraintNode[] = [];

  // Inherit constraints from type alias declarations (lower precedence)
  if (prop.type) {
    constraints.push(...extractTypeAliasConstraintNodes(prop.type, checker, file));
  }

  // Extract JSDoc constraints
  constraints.push(...extractJSDocConstraintNodes(prop, file));

  // Collect annotations
  let annotations: AnnotationNode[] = [];

  // JSDoc annotations (@displayName, @description, @deprecated)
  annotations.push(...extractJSDocAnnotationNodes(prop, file));

  // Default value annotation
  const defaultAnnotation = extractDefaultValueAnnotation(prop.initializer, file);
  if (defaultAnnotation) {
    annotations.push(defaultAnnotation);
  }

  ({ type, annotations } = applyEnumMemberDisplayNames(type, annotations));

  return {
    kind: "field",
    name,
    type,
    required: !optional,
    constraints,
    annotations,
    provenance,
  };
}

/**
 * Analyzes an interface/type-alias property signature into a canonical IR FieldNode.
 */
function analyzeInterfacePropertyToIR(
  prop: ts.PropertySignature,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): FieldNode | null {
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const tsType = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const provenance = provenanceForNode(prop, file);

  // Resolve ts.Type → TypeNode
  let type = resolveTypeNode(tsType, checker, file, typeRegistry, visiting);

  // Collect constraints
  const constraints: ConstraintNode[] = [];

  // Inherit constraints from type alias declarations
  if (prop.type) {
    constraints.push(...extractTypeAliasConstraintNodes(prop.type, checker, file));
  }

  // JSDoc constraints
  constraints.push(...extractJSDocConstraintNodes(prop, file));

  // Collect annotations
  let annotations: AnnotationNode[] = [];

  // JSDoc annotations (@displayName, @description, @deprecated)
  annotations.push(...extractJSDocAnnotationNodes(prop, file));

  ({ type, annotations } = applyEnumMemberDisplayNames(type, annotations));

  return {
    kind: "field",
    name,
    type,
    required: !optional,
    constraints,
    annotations,
    provenance,
  };
}

/**
 * Rewrites enum-member display-name annotations into EnumMember.displayName
 * values and strips those annotations from the field-level annotation list.
 *
 * The TSDoc surface uses `@displayName :value Label` for enum member labels.
 * Plain `@displayName Label` annotations remain as field-level titles.
 */
function applyEnumMemberDisplayNames(
  type: TypeNode,
  annotations: readonly AnnotationNode[]
): { type: TypeNode; annotations: AnnotationNode[] } {
  if (
    !annotations.some(
      (annotation) =>
        annotation.annotationKind === "displayName" && annotation.value.trim().startsWith(":")
    )
  ) {
    return { type, annotations: [...annotations] };
  }

  const consumed = new Set<AnnotationNode>();
  const nextType = rewriteEnumDisplayNames(type, annotations, consumed);

  if (consumed.size === 0) {
    return { type, annotations: [...annotations] };
  }

  return {
    type: nextType,
    annotations: annotations.filter((annotation) => !consumed.has(annotation)),
  };
}

function rewriteEnumDisplayNames(
  type: TypeNode,
  annotations: readonly AnnotationNode[],
  consumed: Set<AnnotationNode>
): TypeNode {
  switch (type.kind) {
    case "enum":
      return applyEnumMemberDisplayNamesToEnum(type, annotations, consumed);

    case "union": {
      return {
        ...type,
        members: type.members.map((member) =>
          rewriteEnumDisplayNames(member, annotations, consumed)
        ),
      };
    }

    default:
      return type;
  }
}

function applyEnumMemberDisplayNamesToEnum(
  type: EnumTypeNode,
  annotations: readonly AnnotationNode[],
  consumed: Set<AnnotationNode>
): EnumTypeNode {
  const displayNames = new Map<string, string>();

  for (const annotation of annotations) {
    if (annotation.annotationKind !== "displayName") continue;

    const parsed = parseEnumMemberDisplayName(annotation.value);
    if (!parsed) continue;

    // Once parsed as a member-target display name, never let it fall back to a
    // field-level title, even if the target value does not exist.
    consumed.add(annotation);

    const member = type.members.find((m) => String(m.value) === parsed.value);
    if (!member) continue;

    displayNames.set(String(member.value), parsed.label);
  }

  if (displayNames.size === 0) {
    return type;
  }

  return {
    ...type,
    members: type.members.map((member) => {
      const displayName = displayNames.get(String(member.value));
      return displayName !== undefined ? { ...member, displayName } : member;
    }),
  };
}

function parseEnumMemberDisplayName(value: string): { value: string; label: string } | null {
  const trimmed = value.trim();
  const match = /^:([^\s]+)\s+([\s\S]+)$/.exec(trimmed);
  if (!match?.[1] || !match[2]) return null;

  const label = match[2].trim();
  if (label === "") return null;

  return { value: match[1], label };
}

// =============================================================================
// TYPE RESOLUTION — ts.Type → TypeNode
// =============================================================================

/**
 * Resolves a TypeScript type to a canonical IR TypeNode.
 */
export function resolveTypeNode(
  type: ts.Type,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): TypeNode {
  // --- Primitives ---
  if (type.flags & ts.TypeFlags.String) {
    return { kind: "primitive", primitiveKind: "string" };
  }
  if (type.flags & ts.TypeFlags.Number) {
    return { kind: "primitive", primitiveKind: "number" };
  }
  if (type.flags & ts.TypeFlags.Boolean) {
    return { kind: "primitive", primitiveKind: "boolean" };
  }
  if (type.flags & ts.TypeFlags.Null) {
    return { kind: "primitive", primitiveKind: "null" };
  }
  if (type.flags & ts.TypeFlags.Undefined) {
    // Undefined maps to null for nullable semantics in JSON Schema
    return { kind: "primitive", primitiveKind: "null" };
  }

  // --- String literal ---
  if (type.isStringLiteral()) {
    return {
      kind: "enum",
      members: [{ value: type.value }],
    };
  }

  // --- Number literal ---
  if (type.isNumberLiteral()) {
    return {
      kind: "enum",
      members: [{ value: type.value }],
    };
  }

  // --- Union types ---
  if (type.isUnion()) {
    return resolveUnionType(type, checker, file, typeRegistry, visiting);
  }

  // --- Array types ---
  if (checker.isArrayType(type)) {
    return resolveArrayType(type, checker, file, typeRegistry, visiting);
  }

  // --- Object types ---
  if (isObjectType(type)) {
    return resolveObjectType(type, checker, file, typeRegistry, visiting);
  }

  // --- Fallback: treat unknown/any/void as string ---
  return { kind: "primitive", primitiveKind: "string" };
}

function resolveUnionType(
  type: ts.UnionType,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): TypeNode {
  const allTypes = type.types;

  const nonNullTypes = allTypes.filter(
    (t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
  );
  const hasNull = allTypes.some((t) => t.flags & ts.TypeFlags.Null);

  // Boolean union: true | false → boolean primitive
  const isBooleanUnion =
    nonNullTypes.length === 2 && nonNullTypes.every((t) => t.flags & ts.TypeFlags.BooleanLiteral);

  if (isBooleanUnion) {
    const boolNode: TypeNode = { kind: "primitive", primitiveKind: "boolean" };
    if (hasNull) {
      return {
        kind: "union",
        members: [boolNode, { kind: "primitive", primitiveKind: "null" }],
      };
    }
    return boolNode;
  }

  // All string literals → EnumTypeNode
  const allStringLiterals = nonNullTypes.every((t) => t.isStringLiteral());
  if (allStringLiterals && nonNullTypes.length > 0) {
    const stringTypes = nonNullTypes.filter((t): t is ts.StringLiteralType => t.isStringLiteral());
    const enumNode: TypeNode = {
      kind: "enum",
      members: stringTypes.map((t) => ({ value: t.value })),
    };
    if (hasNull) {
      return {
        kind: "union",
        members: [enumNode, { kind: "primitive", primitiveKind: "null" }],
      };
    }
    return enumNode;
  }

  // All number literals → EnumTypeNode
  const allNumberLiterals = nonNullTypes.every((t) => t.isNumberLiteral());
  if (allNumberLiterals && nonNullTypes.length > 0) {
    const numberTypes = nonNullTypes.filter((t): t is ts.NumberLiteralType => t.isNumberLiteral());
    const enumNode: TypeNode = {
      kind: "enum",
      members: numberTypes.map((t) => ({ value: t.value })),
    };
    if (hasNull) {
      return {
        kind: "union",
        members: [enumNode, { kind: "primitive", primitiveKind: "null" }],
      };
    }
    return enumNode;
  }

  // Nullable wrapper: T | null with single non-null type
  if (nonNullTypes.length === 1 && nonNullTypes[0]) {
    const inner = resolveTypeNode(nonNullTypes[0], checker, file, typeRegistry, visiting);
    if (hasNull) {
      return {
        kind: "union",
        members: [inner, { kind: "primitive", primitiveKind: "null" }],
      };
    }
    return inner;
  }

  // General union
  const members = nonNullTypes.map((t) =>
    resolveTypeNode(t, checker, file, typeRegistry, visiting)
  );
  if (hasNull) {
    members.push({ kind: "primitive", primitiveKind: "null" });
  }
  return { kind: "union", members };
}

function resolveArrayType(
  type: ts.Type,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): TypeNode {
  const typeArgs = isTypeReference(type) ? type.typeArguments : undefined;
  const elementType = typeArgs?.[0];

  const items = elementType
    ? resolveTypeNode(elementType, checker, file, typeRegistry, visiting)
    : ({ kind: "primitive", primitiveKind: "string" } satisfies TypeNode);

  return { kind: "array", items };
}

/**
 * Returns a `RecordTypeNode` if `type` is a pure dictionary type (string index
 * signature with no named properties), or `null` otherwise.
 *
 * This handles both `Record<string, T>` (a mapped/aliased type) and inline
 * `{ [k: string]: T }` index signature types per spec 003 §2.5.
 */
function tryResolveRecordType(
  type: ts.ObjectType,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): RecordTypeNode | null {
  // Only types with no named properties qualify as pure dictionaries.
  if (type.getProperties().length > 0) {
    return null;
  }
  const indexInfo = checker.getIndexInfoOfType(type, ts.IndexKind.String);
  if (!indexInfo) {
    return null;
  }

  // Circular-reference guard: if we are already resolving this type (e.g.
  // `type X = Record<string, X>`), return null so that `resolveObjectType`
  // falls through to its own visiting-set guard and emits a safe empty object.
  if (visiting.has(type)) {
    return null;
  }

  visiting.add(type);
  try {
    const valueType = resolveTypeNode(indexInfo.type, checker, file, typeRegistry, visiting);
    return { kind: "record", valueType };
  } finally {
    visiting.delete(type);
  }
}

function resolveObjectType(
  type: ts.ObjectType,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): TypeNode {
  // Detect pure dictionary types (Record<string, T> or { [k: string]: T })
  // before any named-type registration to prevent lifting them to $defs.
  const recordNode = tryResolveRecordType(type, checker, file, typeRegistry, visiting);
  if (recordNode) {
    return recordNode;
  }

  // Circular reference guard
  if (visiting.has(type)) {
    return { kind: "object", properties: [], additionalProperties: false };
  }
  visiting.add(type);

  // Check if this is a named type already in the registry
  const typeName = getNamedTypeName(type);
  if (typeName && typeName in typeRegistry) {
    visiting.delete(type);
    return { kind: "reference", name: typeName, typeArguments: [] };
  }

  const properties: ObjectProperty[] = [];

  // Get FieldInfo-level analysis from named type declarations for constraint propagation
  const fieldInfoMap = getNamedTypeFieldNodeInfoMap(type, checker, file, typeRegistry, visiting);

  for (const prop of type.getProperties()) {
    const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!declaration) continue;

    const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
    const optional = !!(prop.flags & ts.SymbolFlags.Optional);
    const propTypeNode = resolveTypeNode(propType, checker, file, typeRegistry, visiting);

    // Get constraints and annotations from the declaration if available
    const fieldNodeInfo = fieldInfoMap?.get(prop.name);

    properties.push({
      name: prop.name,
      type: propTypeNode,
      optional,
      constraints: fieldNodeInfo?.constraints ?? [],
      annotations: fieldNodeInfo?.annotations ?? [],
      provenance: fieldNodeInfo?.provenance ?? provenanceForFile(file),
    });
  }

  visiting.delete(type);

  const objectNode: TypeNode = {
    kind: "object",
    properties,
    additionalProperties: false,
  };

  // Register named types
  if (typeName) {
    typeRegistry[typeName] = {
      name: typeName,
      type: objectNode,
      provenance: provenanceForFile(file),
    };
    return { kind: "reference", name: typeName, typeArguments: [] };
  }

  return objectNode;
}

// =============================================================================
// NAMED TYPE FIELD INFO MAP — for nested constraint propagation
// =============================================================================

interface FieldNodeInfo {
  readonly constraints: readonly ConstraintNode[];
  readonly annotations: readonly AnnotationNode[];
  readonly provenance: Provenance;
}

/**
 * Builds a map from property name to constraint/annotation info for named types.
 * This enables propagating TSDoc constraints from nested type declarations.
 */
function getNamedTypeFieldNodeInfoMap(
  type: ts.Type,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): Map<string, FieldNodeInfo> | null {
  const symbols = [type.getSymbol(), type.aliasSymbol].filter(
    (s): s is ts.Symbol => s?.declarations != null && s.declarations.length > 0
  );

  for (const symbol of symbols) {
    const declarations = symbol.declarations;
    if (!declarations) continue;

    // Try class declaration
    const classDecl = declarations.find(ts.isClassDeclaration);
    if (classDecl) {
      const map = new Map<string, FieldNodeInfo>();
      for (const member of classDecl.members) {
        if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          const fieldNode = analyzeFieldToIR(member, checker, file, typeRegistry, visiting);
          if (fieldNode) {
            map.set(fieldNode.name, {
              constraints: [...fieldNode.constraints],
              annotations: [...fieldNode.annotations],
              provenance: fieldNode.provenance,
            });
          }
        }
      }
      return map;
    }

    // Try interface declaration
    const interfaceDecl = declarations.find(ts.isInterfaceDeclaration);
    if (interfaceDecl) {
      return buildFieldNodeInfoMap(interfaceDecl.members, checker, file, typeRegistry, visiting);
    }

    // Try type alias with type literal body
    const typeAliasDecl = declarations.find(ts.isTypeAliasDeclaration);
    if (typeAliasDecl && ts.isTypeLiteralNode(typeAliasDecl.type)) {
      return buildFieldNodeInfoMap(
        typeAliasDecl.type.members,
        checker,
        file,
        typeRegistry,
        visiting
      );
    }
  }

  return null;
}

function buildFieldNodeInfoMap(
  members: ts.NodeArray<ts.TypeElement>,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): Map<string, FieldNodeInfo> {
  const map = new Map<string, FieldNodeInfo>();
  for (const member of members) {
    if (ts.isPropertySignature(member)) {
      const fieldNode = analyzeInterfacePropertyToIR(member, checker, file, typeRegistry, visiting);
      if (fieldNode) {
        map.set(fieldNode.name, {
          constraints: [...fieldNode.constraints],
          annotations: [...fieldNode.annotations],
          provenance: fieldNode.provenance,
        });
      }
    }
  }
  return map;
}

// =============================================================================
// TYPE ALIAS CONSTRAINT PROPAGATION
// =============================================================================

/** Maximum depth for transitive type alias constraint propagation. */
const MAX_ALIAS_CHAIN_DEPTH = 8;

/**
 * Given a type node referencing a type alias, extracts IR ConstraintNodes
 * from the alias declaration's JSDoc tags.
 *
 * Follows alias chains transitively: if `type Percentage = Integer` and
 * `type Integer = number`, constraints from both `Percentage` and `Integer`
 * are collected. Constraints from closer aliases appear first in the result
 * (higher precedence). Recursion is capped at {@link MAX_ALIAS_CHAIN_DEPTH}
 * levels; exceeding the limit throws to surface pathological alias chains.
 */
function extractTypeAliasConstraintNodes(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  file: string,
  depth = 0
): ConstraintNode[] {
  if (!ts.isTypeReferenceNode(typeNode)) return [];

  if (depth >= MAX_ALIAS_CHAIN_DEPTH) {
    const aliasName = typeNode.typeName.getText();
    throw new Error(
      `Type alias chain exceeds maximum depth of ${String(MAX_ALIAS_CHAIN_DEPTH)} ` +
        `at alias "${aliasName}" in ${file}. ` +
        `Simplify the alias chain or check for circular references.`
    );
  }

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  if (!symbol?.declarations) return [];

  const aliasDecl = symbol.declarations.find(ts.isTypeAliasDeclaration);
  if (!aliasDecl) return [];

  // Don't extract from object type aliases
  if (ts.isTypeLiteralNode(aliasDecl.type)) return [];

  const constraints = extractJSDocConstraintNodes(aliasDecl, file);

  // Transitively follow alias chains (e.g., Percentage → Integer → number)
  // Constraints from parent aliases are appended after the immediate alias's
  // constraints, giving the immediate alias higher precedence.
  constraints.push(...extractTypeAliasConstraintNodes(aliasDecl.type, checker, file, depth + 1));

  return constraints;
}

// =============================================================================
// PROVENANCE HELPERS
// =============================================================================

function provenanceForNode(node: ts.Node, file: string): Provenance {
  const sourceFile = node.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
  };
}

function provenanceForFile(file: string): Provenance {
  return { surface: "tsdoc", file, line: 0, column: 0 };
}

// =============================================================================
// NAMED TYPE HELPERS
// =============================================================================

/**
 * Extracts a stable type name from a ts.ObjectType when it originates from
 * a named declaration (class, interface, or type alias).
 */
function getNamedTypeName(type: ts.ObjectType): string | null {
  const symbol = type.getSymbol();
  if (symbol?.declarations) {
    const decl = symbol.declarations[0];
    if (
      decl &&
      (ts.isClassDeclaration(decl) ||
        ts.isInterfaceDeclaration(decl) ||
        ts.isTypeAliasDeclaration(decl))
    ) {
      const name = ts.isClassDeclaration(decl) ? decl.name?.text : decl.name.text;
      if (name) return name;
    }
  }

  const aliasSymbol = type.aliasSymbol;
  if (aliasSymbol?.declarations) {
    const aliasDecl = aliasSymbol.declarations.find(ts.isTypeAliasDeclaration);
    if (aliasDecl) {
      return aliasDecl.name.text;
    }
  }

  return null;
}

// =============================================================================
// SHARED OUTPUT TYPES
// =============================================================================

/**
 * Analyzed method information.
 */
export interface MethodInfo {
  /** Method name */
  name: string;
  /** Method parameters */
  parameters: ParameterInfo[];
  /** Return type node */
  returnTypeNode: ts.TypeNode | undefined;
  /** Resolved return type */
  returnType: ts.Type;
}

/**
 * Analyzed parameter information.
 */
export interface ParameterInfo {
  /** Parameter name */
  name: string;
  /** TypeScript type node */
  typeNode: ts.TypeNode | undefined;
  /** Resolved type */
  type: ts.Type;
  /** If this is InferSchema<typeof X>, the export name X */
  formSpecExportName: string | null;
  /** Whether the parameter is optional (has ? or default value) */
  optional: boolean;
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

/**
 * Analyzes a method declaration to extract method info.
 * Shared between IR and legacy paths.
 */
function analyzeMethod(method: ts.MethodDeclaration, checker: ts.TypeChecker): MethodInfo | null {
  if (!ts.isIdentifier(method.name)) {
    return null;
  }

  const name = method.name.text;
  const parameters: ParameterInfo[] = [];

  for (const param of method.parameters) {
    if (ts.isIdentifier(param.name)) {
      const paramInfo = analyzeParameter(param, checker);
      parameters.push(paramInfo);
    }
  }

  const returnTypeNode = method.type;
  const signature = checker.getSignatureFromDeclaration(method);
  const returnType = signature
    ? checker.getReturnTypeOfSignature(signature)
    : checker.getTypeAtLocation(method);

  return { name, parameters, returnTypeNode, returnType };
}

function analyzeParameter(param: ts.ParameterDeclaration, checker: ts.TypeChecker): ParameterInfo {
  const name = ts.isIdentifier(param.name) ? param.name.text : "param";
  const typeNode = param.type;
  const type = checker.getTypeAtLocation(param);
  const formSpecExportName = detectFormSpecReference(typeNode);
  const optional = param.questionToken !== undefined || param.initializer !== undefined;

  return { name, typeNode, type, formSpecExportName, optional };
}

function detectFormSpecReference(typeNode: ts.TypeNode | undefined): string | null {
  if (!typeNode) return null;

  if (!ts.isTypeReferenceNode(typeNode)) return null;

  const typeName = ts.isIdentifier(typeNode.typeName)
    ? typeNode.typeName.text
    : ts.isQualifiedName(typeNode.typeName)
      ? typeNode.typeName.right.text
      : null;

  if (typeName !== "InferSchema" && typeName !== "InferFormSchema") return null;

  const typeArg = typeNode.typeArguments?.[0];
  if (!typeArg || !ts.isTypeQueryNode(typeArg)) return null;

  if (ts.isIdentifier(typeArg.exprName)) {
    return typeArg.exprName.text;
  }

  if (ts.isQualifiedName(typeArg.exprName)) {
    return typeArg.exprName.right.text;
  }

  return null;
}
