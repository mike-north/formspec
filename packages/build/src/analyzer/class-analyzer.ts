/**
 * Class analyzer for extracting fields, types, and JSDoc constraints.
 *
 * Produces `IRClassAnalysis` containing `FieldNode[]` and `typeRegistry`
 * directly from class, interface, or type alias declarations.
 * All downstream generation routes through the canonical FormIR.
 */

import * as ts from "typescript";
import type { ConstraintSemanticDiagnostic } from "@formspec/analysis/internal";
import type {
  FieldNode,
  TypeNode,
  EnumTypeNode,
  EnumMember,
  ConstraintNode,
  AnnotationNode,
  Provenance,
  ObjectProperty,
  RecordTypeNode,
  TypeDefinition,
  JsonValue,
} from "@formspec/core/internals";
import {
  extractJSDocConstraintNodes,
  extractJSDocAnnotationNodes,
  extractDefaultValueAnnotation,
  extractJSDocParseResult,
} from "./jsdoc-constraints.js";
import { extractDisplayNameMetadata } from "./tsdoc-parser.js";
import type { ExtensionRegistry } from "../extensions/index.js";

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

/**
 * Placeholder used while a named object type is still being expanded.
 *
 * The object identity matters: final empty-object schemas are distinct
 * instances, so we can tell an in-progress registry entry from a real one.
 */
const RESOLVING_TYPE_PLACEHOLDER: TypeNode = {
  kind: "object",
  properties: [],
  additionalProperties: true,
};

function makeParseOptions(
  extensionRegistry: ExtensionRegistry | undefined,
  fieldType?: TypeNode,
  checker?: ts.TypeChecker,
  subjectType?: ts.Type,
  hostType?: ts.Type
): import("./tsdoc-parser.js").ParseTSDocOptions | undefined {
  if (
    extensionRegistry === undefined &&
    fieldType === undefined &&
    checker === undefined &&
    subjectType === undefined &&
    hostType === undefined
  ) {
    return undefined;
  }

  return {
    ...(extensionRegistry !== undefined && { extensionRegistry }),
    ...(fieldType !== undefined && { fieldType }),
    ...(checker !== undefined && { checker }),
    ...(subjectType !== undefined && { subjectType }),
    ...(hostType !== undefined && { hostType }),
  };
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
  /** Root-level metadata for the analyzed declaration. */
  readonly annotations?: readonly AnnotationNode[];
  /** Extraction-time diagnostics surfaced before IR validation. */
  readonly diagnostics?: readonly ConstraintSemanticDiagnostic[];
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
  file = "",
  extensionRegistry?: ExtensionRegistry
): IRClassAnalysis {
  const name = classDecl.name?.text ?? "AnonymousClass";
  const fields: FieldNode[] = [];
  const fieldLayouts: FieldLayoutMetadata[] = [];
  const typeRegistry: Record<string, TypeDefinition> = {};
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  const classType = checker.getTypeAtLocation(classDecl);
  const classDoc = extractJSDocParseResult(
    classDecl,
    file,
    makeParseOptions(extensionRegistry, undefined, checker, classType, classType)
  );
  const annotations = [...classDoc.annotations];
  diagnostics.push(...classDoc.diagnostics);
  const visiting = new Set<ts.Type>();
  const instanceMethods: MethodInfo[] = [];
  const staticMethods: MethodInfo[] = [];

  for (const member of classDecl.members) {
    if (ts.isPropertyDeclaration(member)) {
      const fieldNode = analyzeFieldToIR(
        member,
        checker,
        file,
        typeRegistry,
        visiting,
        diagnostics,
        classType,
        extensionRegistry
      );
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

  return {
    name,
    fields,
    fieldLayouts,
    typeRegistry,
    ...(annotations.length > 0 && { annotations }),
    ...(diagnostics.length > 0 && { diagnostics }),
    instanceMethods,
    staticMethods,
  };
}

/**
 * Analyzes an interface declaration and produces canonical IR FieldNodes.
 */
export function analyzeInterfaceToIR(
  interfaceDecl: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  file = "",
  extensionRegistry?: ExtensionRegistry
): IRClassAnalysis {
  const name = interfaceDecl.name.text;
  const fields: FieldNode[] = [];
  const typeRegistry: Record<string, TypeDefinition> = {};
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  const interfaceType = checker.getTypeAtLocation(interfaceDecl);
  const interfaceDoc = extractJSDocParseResult(
    interfaceDecl,
    file,
    makeParseOptions(extensionRegistry, undefined, checker, interfaceType, interfaceType)
  );
  const annotations = [...interfaceDoc.annotations];
  diagnostics.push(...interfaceDoc.diagnostics);
  const visiting = new Set<ts.Type>();

  for (const member of interfaceDecl.members) {
    if (ts.isPropertySignature(member)) {
      const fieldNode = analyzeInterfacePropertyToIR(
        member,
        checker,
        file,
        typeRegistry,
        visiting,
        diagnostics,
        interfaceType,
        extensionRegistry
      );
      if (fieldNode) {
        fields.push(fieldNode);
      }
    }
  }

  const fieldLayouts: FieldLayoutMetadata[] = fields.map(() => ({}));
  return {
    name,
    fields,
    fieldLayouts,
    typeRegistry,
    ...(annotations.length > 0 && { annotations }),
    ...(diagnostics.length > 0 && { diagnostics }),
    instanceMethods: [],
    staticMethods: [],
  };
}

/**
 * Analyzes a type alias declaration and produces canonical IR FieldNodes.
 */
export function analyzeTypeAliasToIR(
  typeAlias: ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  file = "",
  extensionRegistry?: ExtensionRegistry
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
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  const aliasType = checker.getTypeAtLocation(typeAlias);
  const typeAliasDoc = extractJSDocParseResult(
    typeAlias,
    file,
    makeParseOptions(extensionRegistry, undefined, checker, aliasType, aliasType)
  );
  const annotations = [...typeAliasDoc.annotations];
  diagnostics.push(...typeAliasDoc.diagnostics);
  const visiting = new Set<ts.Type>();

  for (const member of typeAlias.type.members) {
    if (ts.isPropertySignature(member)) {
      const fieldNode = analyzeInterfacePropertyToIR(
        member,
        checker,
        file,
        typeRegistry,
        visiting,
        diagnostics,
        aliasType,
        extensionRegistry
      );
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
      ...(annotations.length > 0 && { annotations }),
      ...(diagnostics.length > 0 && { diagnostics }),
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
  visiting: Set<ts.Type>,
  diagnostics: ConstraintSemanticDiagnostic[],
  hostType: ts.Type,
  extensionRegistry?: ExtensionRegistry
): FieldNode | null {
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const tsType = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const provenance = provenanceForNode(prop, file);

  // Resolve ts.Type → TypeNode
  let type = resolveTypeNode(
    tsType,
    checker,
    file,
    typeRegistry,
    visiting,
    prop,
    extensionRegistry,
    diagnostics
  );

  // Collect constraints
  const constraints: ConstraintNode[] = [];

  // Inherit constraints from type alias declarations (lower precedence)
  if (prop.type && !shouldEmitPrimitiveAliasDefinition(prop.type, checker)) {
    constraints.push(
      ...extractTypeAliasConstraintNodes(prop.type, checker, file, extensionRegistry)
    );
  }

  // Extract JSDoc constraints
  const docResult = extractJSDocParseResult(
    prop,
    file,
    makeParseOptions(extensionRegistry, type, checker, tsType, hostType)
  );
  constraints.push(...docResult.constraints);
  diagnostics.push(...docResult.diagnostics);

  // Collect annotations
  let annotations: AnnotationNode[] = [];

  // JSDoc annotations (@displayName, @deprecated, summary, @remarks)
  annotations.push(...docResult.annotations);

  // Default value annotation
  const defaultAnnotation = extractDefaultValueAnnotation(prop.initializer, file);
  if (defaultAnnotation && !annotations.some((a) => a.annotationKind === "defaultValue")) {
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
  visiting: Set<ts.Type>,
  diagnostics: ConstraintSemanticDiagnostic[],
  hostType: ts.Type,
  extensionRegistry?: ExtensionRegistry
): FieldNode | null {
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const tsType = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const provenance = provenanceForNode(prop, file);

  // Resolve ts.Type → TypeNode
  let type = resolveTypeNode(
    tsType,
    checker,
    file,
    typeRegistry,
    visiting,
    prop,
    extensionRegistry,
    diagnostics
  );

  // Collect constraints
  const constraints: ConstraintNode[] = [];

  // Inherit constraints from type alias declarations
  if (prop.type && !shouldEmitPrimitiveAliasDefinition(prop.type, checker)) {
    constraints.push(
      ...extractTypeAliasConstraintNodes(prop.type, checker, file, extensionRegistry)
    );
  }

  // JSDoc constraints
  const docResult = extractJSDocParseResult(
    prop,
    file,
    makeParseOptions(extensionRegistry, type, checker, tsType, hostType)
  );
  constraints.push(...docResult.constraints);
  diagnostics.push(...docResult.diagnostics);

  // Collect annotations
  let annotations: AnnotationNode[] = [];

  // JSDoc annotations (@displayName, @deprecated, summary, @remarks)
  annotations.push(...docResult.annotations);

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

function resolveRegisteredCustomType(
  sourceNode: ts.Node | undefined,
  extensionRegistry: ExtensionRegistry | undefined,
  checker: ts.TypeChecker
): TypeNode | null {
  if (sourceNode === undefined || extensionRegistry === undefined) {
    return null;
  }

  const typeNode = extractTypeNodeFromSource(sourceNode);
  if (typeNode === undefined) {
    return null;
  }

  return resolveRegisteredCustomTypeFromTypeNode(typeNode, extensionRegistry, checker);
}

function resolveRegisteredCustomTypeFromTypeNode(
  typeNode: ts.TypeNode,
  extensionRegistry: ExtensionRegistry,
  checker: ts.TypeChecker
): TypeNode | null {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolveRegisteredCustomTypeFromTypeNode(typeNode.type, extensionRegistry, checker);
  }

  const typeName = getTypeNodeRegistrationName(typeNode);
  if (typeName === null) {
    return null;
  }

  const registration = extensionRegistry.findTypeByName(typeName);
  if (registration !== undefined) {
    return {
      kind: "custom",
      typeId: `${registration.extensionId}/${registration.registration.typeName}`,
      payload: null,
    };
  }

  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const aliasDecl = checker
      .getSymbolAtLocation(typeNode.typeName)
      ?.declarations?.find(ts.isTypeAliasDeclaration);
    if (aliasDecl !== undefined) {
      return resolveRegisteredCustomTypeFromTypeNode(aliasDecl.type, extensionRegistry, checker);
    }
  }

  return null;
}

function extractTypeNodeFromSource(sourceNode: ts.Node): ts.TypeNode | undefined {
  if (
    ts.isPropertyDeclaration(sourceNode) ||
    ts.isPropertySignature(sourceNode) ||
    ts.isParameter(sourceNode) ||
    ts.isTypeAliasDeclaration(sourceNode)
  ) {
    return sourceNode.type;
  }

  if (ts.isTypeNode(sourceNode)) {
    return sourceNode;
  }

  return undefined;
}

function getTypeNodeRegistrationName(typeNode: ts.TypeNode): string | null {
  if (ts.isTypeReferenceNode(typeNode)) {
    return ts.isIdentifier(typeNode.typeName)
      ? typeNode.typeName.text
      : typeNode.typeName.right.text;
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return getTypeNodeRegistrationName(typeNode.type);
  }

  if (
    typeNode.kind === ts.SyntaxKind.BigIntKeyword ||
    typeNode.kind === ts.SyntaxKind.StringKeyword ||
    typeNode.kind === ts.SyntaxKind.NumberKeyword ||
    typeNode.kind === ts.SyntaxKind.BooleanKeyword
  ) {
    return typeNode.getText();
  }

  return null;
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
  visiting: Set<ts.Type>,
  sourceNode?: ts.Node,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): TypeNode {
  const customType = resolveRegisteredCustomType(sourceNode, extensionRegistry, checker);
  if (customType) {
    return customType;
  }
  const primitiveAlias = tryResolveNamedPrimitiveAlias(
    type,
    checker,
    file,
    typeRegistry,
    visiting,
    sourceNode,
    extensionRegistry,
    diagnostics
  );
  if (primitiveAlias) {
    return primitiveAlias;
  }

  // --- Primitives ---
  if (type.flags & ts.TypeFlags.String) {
    return { kind: "primitive", primitiveKind: "string" };
  }
  if (type.flags & ts.TypeFlags.Number) {
    return { kind: "primitive", primitiveKind: "number" };
  }
  if (type.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) {
    return { kind: "primitive", primitiveKind: "bigint" };
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
    return resolveUnionType(
      type,
      checker,
      file,
      typeRegistry,
      visiting,
      sourceNode,
      extensionRegistry,
      diagnostics
    );
  }

  // --- Array types ---
  if (checker.isArrayType(type)) {
    return resolveArrayType(
      type,
      checker,
      file,
      typeRegistry,
      visiting,
      sourceNode,
      extensionRegistry,
      diagnostics
    );
  }

  // --- Object types ---
  if (isObjectType(type)) {
    return resolveObjectType(
      type,
      checker,
      file,
      typeRegistry,
      visiting,
      extensionRegistry,
      diagnostics
    );
  }

  // --- Fallback: treat unknown/any/void as string ---
  return { kind: "primitive", primitiveKind: "string" };
}

function tryResolveNamedPrimitiveAlias(
  type: ts.Type,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>,
  sourceNode?: ts.Node,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): TypeNode | null {
  if (
    !(
      type.flags &
      (ts.TypeFlags.String |
        ts.TypeFlags.Number |
        ts.TypeFlags.BigInt |
        ts.TypeFlags.BigIntLiteral |
        ts.TypeFlags.Boolean |
        ts.TypeFlags.Null)
    )
  ) {
    return null;
  }

  const aliasDecl =
    type.aliasSymbol?.declarations?.find(ts.isTypeAliasDeclaration) ??
    getReferencedTypeAliasDeclaration(sourceNode, checker);
  if (!aliasDecl) {
    return null;
  }

  const aliasName = aliasDecl.name.text;
  if (!typeRegistry[aliasName]) {
    const aliasType = checker.getTypeFromTypeNode(aliasDecl.type);
    const constraints = [
      ...extractJSDocConstraintNodes(aliasDecl, file, makeParseOptions(extensionRegistry)),
      ...extractTypeAliasConstraintNodes(aliasDecl.type, checker, file, extensionRegistry),
    ];
    const annotations = extractJSDocAnnotationNodes(
      aliasDecl,
      file,
      makeParseOptions(extensionRegistry)
    );
    typeRegistry[aliasName] = {
      name: aliasName,
      type: resolveAliasedPrimitiveTarget(
        aliasType,
        checker,
        file,
        typeRegistry,
        visiting,
        extensionRegistry,
        diagnostics
      ),
      ...(constraints.length > 0 && { constraints }),
      ...(annotations.length > 0 && { annotations }),
      provenance: provenanceForDeclaration(aliasDecl, file),
    };
  }

  return { kind: "reference", name: aliasName, typeArguments: [] };
}

function getReferencedTypeAliasDeclaration(
  sourceNode: ts.Node | undefined,
  checker: ts.TypeChecker
): ts.TypeAliasDeclaration | undefined {
  const typeNode =
    sourceNode &&
    (ts.isPropertyDeclaration(sourceNode) ||
      ts.isPropertySignature(sourceNode) ||
      ts.isParameter(sourceNode))
      ? sourceNode.type
      : undefined;
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) {
    return undefined;
  }

  return checker
    .getSymbolAtLocation(typeNode.typeName)
    ?.declarations?.find(ts.isTypeAliasDeclaration);
}

function shouldEmitPrimitiveAliasDefinition(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): boolean {
  if (!ts.isTypeReferenceNode(typeNode)) {
    return false;
  }

  const aliasDecl = checker
    .getSymbolAtLocation(typeNode.typeName)
    ?.declarations?.find(ts.isTypeAliasDeclaration);
  if (!aliasDecl) {
    return false;
  }

  const resolved = checker.getTypeFromTypeNode(aliasDecl.type);
  return !!(
    resolved.flags &
    (ts.TypeFlags.String |
      ts.TypeFlags.Number |
      ts.TypeFlags.BigInt |
      ts.TypeFlags.BigIntLiteral |
      ts.TypeFlags.Boolean |
      ts.TypeFlags.Null)
  );
}

function resolveAliasedPrimitiveTarget(
  type: ts.Type,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): TypeNode {
  const nestedAliasDecl = type.aliasSymbol?.declarations?.find(ts.isTypeAliasDeclaration);
  if (nestedAliasDecl !== undefined) {
    return resolveAliasedPrimitiveTarget(
      checker.getTypeFromTypeNode(nestedAliasDecl.type),
      checker,
      file,
      typeRegistry,
      visiting,
      extensionRegistry,
      diagnostics
    );
  }

  return resolveTypeNode(
    type,
    checker,
    file,
    typeRegistry,
    visiting,
    undefined,
    extensionRegistry,
    diagnostics
  );
}

function resolveUnionType(
  type: ts.UnionType,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>,
  sourceNode?: ts.Node,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): TypeNode {
  const typeName = getNamedTypeName(type);
  const namedDecl = getNamedTypeDeclaration(type);

  if (typeName && typeName in typeRegistry) {
    return { kind: "reference", name: typeName, typeArguments: [] };
  }

  const allTypes = type.types;
  const unionMemberTypeNodes = extractUnionMemberTypeNodes(sourceNode, checker);
  const nonNullSourceNodes = unionMemberTypeNodes.filter(
    (memberTypeNode) => !isNullishTypeNode(resolveAliasedTypeNode(memberTypeNode, checker))
  );
  const nonNullTypes = allTypes.filter(
    (memberType) => !(memberType.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
  );
  const nonNullMembers = nonNullTypes.map((memberType, index) => ({
    memberType,
    sourceNode:
      nonNullSourceNodes.length === nonNullTypes.length ? nonNullSourceNodes[index] : undefined,
  }));
  const hasNull = allTypes.some((t) => t.flags & ts.TypeFlags.Null);
  const memberDisplayNames = new Map<string, string>();
  if (namedDecl) {
    for (const [value, label] of extractDisplayNameMetadata(namedDecl).memberDisplayNames) {
      memberDisplayNames.set(value, label);
    }
  }
  if (sourceNode) {
    for (const [value, label] of extractDisplayNameMetadata(sourceNode).memberDisplayNames) {
      memberDisplayNames.set(value, label);
    }
  }

  const registerNamed = (result: TypeNode): TypeNode => {
    if (!typeName) {
      return result;
    }
    const annotations = namedDecl
      ? extractJSDocAnnotationNodes(namedDecl, file, makeParseOptions(extensionRegistry))
      : undefined;
    typeRegistry[typeName] = {
      name: typeName,
      type: result,
      ...(annotations !== undefined && annotations.length > 0 && { annotations }),
      provenance: provenanceForDeclaration(namedDecl ?? sourceNode, file),
    };
    return { kind: "reference", name: typeName, typeArguments: [] };
  };

  const applyMemberLabels = (members: readonly (string | number)[]): EnumMember[] =>
    members.map((value) => {
      const displayName = memberDisplayNames.get(String(value));
      return displayName !== undefined ? { value, displayName } : { value };
    });

  const isBooleanUnion =
    nonNullTypes.length === 2 && nonNullTypes.every((t) => t.flags & ts.TypeFlags.BooleanLiteral);

  if (isBooleanUnion) {
    const boolNode: TypeNode = { kind: "primitive", primitiveKind: "boolean" };
    const result: TypeNode = hasNull
      ? {
          kind: "union",
          members: [boolNode, { kind: "primitive", primitiveKind: "null" }],
        }
      : boolNode;
    return registerNamed(result);
  }

  const allStringLiterals = nonNullTypes.every((t) => t.isStringLiteral());
  if (allStringLiterals && nonNullTypes.length > 0) {
    const stringTypes = nonNullTypes.filter((t): t is ts.StringLiteralType => t.isStringLiteral());
    const enumNode: TypeNode = {
      kind: "enum",
      members: applyMemberLabels(stringTypes.map((t) => t.value)),
    };
    const result: TypeNode = hasNull
      ? {
          kind: "union",
          members: [enumNode, { kind: "primitive", primitiveKind: "null" }],
        }
      : enumNode;
    return registerNamed(result);
  }

  const allNumberLiterals = nonNullTypes.every((t) => t.isNumberLiteral());
  if (allNumberLiterals && nonNullTypes.length > 0) {
    const numberTypes = nonNullTypes.filter((t): t is ts.NumberLiteralType => t.isNumberLiteral());
    const enumNode: TypeNode = {
      kind: "enum",
      members: applyMemberLabels(numberTypes.map((t) => t.value)),
    };
    const result: TypeNode = hasNull
      ? {
          kind: "union",
          members: [enumNode, { kind: "primitive", primitiveKind: "null" }],
        }
      : enumNode;
    return registerNamed(result);
  }

  if (nonNullMembers.length === 1 && nonNullMembers[0]) {
    const inner = resolveTypeNode(
      nonNullMembers[0].memberType,
      checker,
      file,
      typeRegistry,
      visiting,
      nonNullMembers[0].sourceNode ?? sourceNode,
      extensionRegistry,
      diagnostics
    );
    const result: TypeNode = hasNull
      ? {
          kind: "union",
          members: [inner, { kind: "primitive", primitiveKind: "null" }],
        }
      : inner;
    return registerNamed(result);
  }

  const members = nonNullMembers.map(({ memberType, sourceNode: memberSourceNode }) =>
    resolveTypeNode(
      memberType,
      checker,
      file,
      typeRegistry,
      visiting,
      memberSourceNode ?? sourceNode,
      extensionRegistry,
      diagnostics
    )
  );
  if (hasNull) {
    members.push({ kind: "primitive", primitiveKind: "null" });
  }
  return registerNamed({ kind: "union", members });
}

function resolveArrayType(
  type: ts.Type,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>,
  sourceNode?: ts.Node,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): TypeNode {
  const typeArgs = isTypeReference(type) ? type.typeArguments : undefined;
  const elementType = typeArgs?.[0];
  const elementSourceNode = extractArrayElementTypeNode(sourceNode, checker);

  const items = elementType
    ? resolveTypeNode(
        elementType,
        checker,
        file,
        typeRegistry,
        visiting,
        elementSourceNode,
        extensionRegistry,
        diagnostics
      )
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
  visiting: Set<ts.Type>,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): RecordTypeNode | null {
  // Only types with no named properties qualify as pure dictionaries.
  if (type.getProperties().length > 0) {
    return null;
  }
  const indexInfo = checker.getIndexInfoOfType(type, ts.IndexKind.String);
  if (!indexInfo) {
    return null;
  }

  const valueType = resolveTypeNode(
    indexInfo.type,
    checker,
    file,
    typeRegistry,
    visiting,
    undefined,
    extensionRegistry,
    diagnostics
  );
  return { kind: "record", valueType };
}

function typeNodeContainsReference(type: TypeNode, targetName: string): boolean {
  switch (type.kind) {
    case "reference":
      return type.name === targetName;
    case "array":
      return typeNodeContainsReference(type.items, targetName);
    case "record":
      return typeNodeContainsReference(type.valueType, targetName);
    case "union":
      return type.members.some((member) => typeNodeContainsReference(member, targetName));
    case "object":
      return type.properties.some((property) =>
        typeNodeContainsReference(property.type, targetName)
      );
    case "primitive":
    case "enum":
    case "dynamic":
    case "custom":
      return false;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function resolveObjectType(
  type: ts.ObjectType,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>,
  extensionRegistry?: ExtensionRegistry,
  diagnostics?: ConstraintSemanticDiagnostic[]
): TypeNode {
  const typeName = getNamedTypeName(type);
  const namedTypeName = typeName ?? undefined;
  const namedDecl = getNamedTypeDeclaration(type);
  const shouldRegisterNamedType =
    namedTypeName !== undefined &&
    !(namedTypeName === "Record" && namedDecl?.getSourceFile().fileName !== file);
  const clearNamedTypeRegistration = (): void => {
    if (namedTypeName === undefined || !shouldRegisterNamedType) {
      return;
    }
    Reflect.deleteProperty(typeRegistry, namedTypeName);
  };

  if (visiting.has(type)) {
    // Recursive object expansion is deferred through the named-type registry.
    // Anonymous cycles still collapse to a closed empty object sentinel.
    if (namedTypeName !== undefined && shouldRegisterNamedType) {
      return { kind: "reference", name: namedTypeName, typeArguments: [] };
    }
    return { kind: "object", properties: [], additionalProperties: false };
  }

  // Seed the registry with a placeholder before traversing children so any
  // recursive property reference can resolve to a stable `$ref`.
  if (namedTypeName !== undefined && shouldRegisterNamedType && !typeRegistry[namedTypeName]) {
    typeRegistry[namedTypeName] = {
      name: namedTypeName,
      type: RESOLVING_TYPE_PLACEHOLDER,
      provenance: provenanceForDeclaration(namedDecl, file),
    };
  }

  visiting.add(type);

  // Detect previously resolved named types before walking the object body.
  if (
    namedTypeName !== undefined &&
    shouldRegisterNamedType &&
    typeRegistry[namedTypeName]?.type !== undefined
  ) {
    if (typeRegistry[namedTypeName].type !== RESOLVING_TYPE_PLACEHOLDER) {
      visiting.delete(type);
      return { kind: "reference", name: namedTypeName, typeArguments: [] };
    }
  }

  // Detect pure dictionary types (Record<string, T> or { [k: string]: T })
  // after the recursion guard/placeholder setup so recursive records can point
  // back at the named type instead of collapsing to an empty object.
  const recordNode = tryResolveRecordType(
    type,
    checker,
    file,
    typeRegistry,
    visiting,
    extensionRegistry,
    diagnostics
  );
  if (recordNode) {
    visiting.delete(type);
    if (namedTypeName !== undefined && shouldRegisterNamedType) {
      const isRecursiveRecord = typeNodeContainsReference(recordNode.valueType, namedTypeName);
      if (!isRecursiveRecord) {
        clearNamedTypeRegistration();
        return recordNode;
      }
      const annotations = namedDecl
        ? extractJSDocAnnotationNodes(namedDecl, file, makeParseOptions(extensionRegistry))
        : undefined;
      typeRegistry[namedTypeName] = {
        name: namedTypeName,
        type: recordNode,
        ...(annotations !== undefined && annotations.length > 0 && { annotations }),
        provenance: provenanceForDeclaration(namedDecl, file),
      };
      return { kind: "reference", name: namedTypeName, typeArguments: [] };
    }
    return recordNode;
  }

  const properties: ObjectProperty[] = [];

  // Get FieldInfo-level analysis from named type declarations for constraint propagation
  const fieldInfoMap = getNamedTypeFieldNodeInfoMap(
    type,
    checker,
    file,
    typeRegistry,
    visiting,
    diagnostics ?? [],
    extensionRegistry
  );

  for (const prop of type.getProperties()) {
    const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!declaration) continue;

    const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
    const optional = !!(prop.flags & ts.SymbolFlags.Optional);
    const propTypeNode = resolveTypeNode(
      propType,
      checker,
      file,
      typeRegistry,
      visiting,
      declaration,
      extensionRegistry,
      diagnostics
    );

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
    additionalProperties: true,
  };

  // Register named types
  if (namedTypeName !== undefined && shouldRegisterNamedType) {
    const annotations = namedDecl
      ? extractJSDocAnnotationNodes(namedDecl, file, makeParseOptions(extensionRegistry))
      : undefined;
    typeRegistry[namedTypeName] = {
      name: namedTypeName,
      type: objectNode,
      ...(annotations !== undefined && annotations.length > 0 && { annotations }),
      provenance: provenanceForDeclaration(namedDecl, file),
    };
    return { kind: "reference", name: namedTypeName, typeArguments: [] };
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
  visiting: Set<ts.Type>,
  diagnostics: ConstraintSemanticDiagnostic[],
  extensionRegistry?: ExtensionRegistry
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
      const hostType = checker.getTypeAtLocation(classDecl);
      for (const member of classDecl.members) {
        if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          const fieldNode = analyzeFieldToIR(
            member,
            checker,
            file,
            typeRegistry,
            visiting,
            diagnostics,
            hostType,
            extensionRegistry
          );
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
      return buildFieldNodeInfoMap(
        interfaceDecl.members,
        checker,
        file,
        typeRegistry,
        visiting,
        checker.getTypeAtLocation(interfaceDecl),
        diagnostics,
        extensionRegistry
      );
    }

    // Try type alias with type literal body
    const typeAliasDecl = declarations.find(ts.isTypeAliasDeclaration);
    if (typeAliasDecl && ts.isTypeLiteralNode(typeAliasDecl.type)) {
      return buildFieldNodeInfoMap(
        typeAliasDecl.type.members,
        checker,
        file,
        typeRegistry,
        visiting,
        checker.getTypeAtLocation(typeAliasDecl),
        diagnostics,
        extensionRegistry
      );
    }
  }

  return null;
}

function extractArrayElementTypeNode(
  sourceNode: ts.Node | undefined,
  checker: ts.TypeChecker
): ts.TypeNode | undefined {
  const typeNode = sourceNode === undefined ? undefined : extractTypeNodeFromSource(sourceNode);
  if (typeNode === undefined) {
    return undefined;
  }
  const resolvedTypeNode = resolveAliasedTypeNode(typeNode, checker);
  if (ts.isArrayTypeNode(resolvedTypeNode)) {
    return resolvedTypeNode.elementType;
  }
  if (
    ts.isTypeReferenceNode(resolvedTypeNode) &&
    ts.isIdentifier(resolvedTypeNode.typeName) &&
    resolvedTypeNode.typeName.text === "Array" &&
    resolvedTypeNode.typeArguments?.[0]
  ) {
    return resolvedTypeNode.typeArguments[0];
  }
  return undefined;
}

function extractUnionMemberTypeNodes(
  sourceNode: ts.Node | undefined,
  checker: ts.TypeChecker
): readonly ts.TypeNode[] {
  const typeNode = sourceNode === undefined ? undefined : extractTypeNodeFromSource(sourceNode);
  if (!typeNode) {
    return [];
  }
  const resolvedTypeNode = resolveAliasedTypeNode(typeNode, checker);
  return ts.isUnionTypeNode(resolvedTypeNode) ? [...resolvedTypeNode.types] : [];
}

function resolveAliasedTypeNode(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.TypeAliasDeclaration> = new Set<ts.TypeAliasDeclaration>()
): ts.TypeNode {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolveAliasedTypeNode(typeNode.type, checker, visited);
  }

  if (!ts.isTypeReferenceNode(typeNode) || !ts.isIdentifier(typeNode.typeName)) {
    return typeNode;
  }

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  const aliasDecl = symbol?.declarations?.find(ts.isTypeAliasDeclaration);
  if (aliasDecl === undefined || visited.has(aliasDecl)) {
    return typeNode;
  }

  visited.add(aliasDecl);
  return resolveAliasedTypeNode(aliasDecl.type, checker, visited);
}

function isNullishTypeNode(typeNode: ts.TypeNode): boolean {
  if (
    typeNode.kind === ts.SyntaxKind.NullKeyword ||
    typeNode.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return true;
  }

  return (
    ts.isLiteralTypeNode(typeNode) &&
    (typeNode.literal.kind === ts.SyntaxKind.NullKeyword ||
      typeNode.literal.kind === ts.SyntaxKind.UndefinedKeyword)
  );
}

function buildFieldNodeInfoMap(
  members: ts.NodeArray<ts.TypeElement>,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>,
  hostType: ts.Type,
  diagnostics: ConstraintSemanticDiagnostic[],
  extensionRegistry?: ExtensionRegistry
): Map<string, FieldNodeInfo> {
  const map = new Map<string, FieldNodeInfo>();
  for (const member of members) {
    if (ts.isPropertySignature(member)) {
      const fieldNode = analyzeInterfacePropertyToIR(
        member,
        checker,
        file,
        typeRegistry,
        visiting,
        diagnostics,
        hostType,
        extensionRegistry
      );
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
  extensionRegistry?: ExtensionRegistry,
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

  const aliasFieldType = resolveTypeNode(
    checker.getTypeAtLocation(aliasDecl.type),
    checker,
    file,
    {},
    new Set<ts.Type>(),
    aliasDecl.type,
    extensionRegistry
  );
  const constraints = extractJSDocConstraintNodes(
    aliasDecl,
    file,
    makeParseOptions(extensionRegistry, aliasFieldType)
  );

  // Transitively follow alias chains (e.g., Percentage → Integer → number)
  // Constraints from parent aliases are appended after the immediate alias's
  // constraints, giving the immediate alias higher precedence.
  constraints.push(
    ...extractTypeAliasConstraintNodes(aliasDecl.type, checker, file, extensionRegistry, depth + 1)
  );

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

function provenanceForDeclaration(node: ts.Node | undefined, file: string): Provenance {
  if (!node) {
    return provenanceForFile(file);
  }
  return provenanceForNode(node, file);
}

// =============================================================================
// NAMED TYPE HELPERS
// =============================================================================

/**
 * Extracts a stable type name from a ts.Type when it originates from
 * a named declaration (class, interface, or type alias).
 */
function getNamedTypeName(type: ts.Type): string | null {
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

/**
 * Returns the declaration that defines a named type, if available.
 */
function getNamedTypeDeclaration(type: ts.Type): ts.Declaration | undefined {
  const symbol = type.getSymbol();
  if (symbol?.declarations) {
    const decl = symbol.declarations[0];
    if (
      decl &&
      (ts.isClassDeclaration(decl) ||
        ts.isInterfaceDeclaration(decl) ||
        ts.isTypeAliasDeclaration(decl))
    ) {
      return decl;
    }
  }

  const aliasSymbol = type.aliasSymbol;
  if (aliasSymbol?.declarations) {
    return aliasSymbol.declarations.find(ts.isTypeAliasDeclaration);
  }

  return undefined;
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
