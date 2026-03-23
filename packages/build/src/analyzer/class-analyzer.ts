/**
 * Class analyzer for extracting fields, types, and decorators.
 *
 * This module has two output paths:
 *
 * 1. **IR path** (new): `analyzeClassToIR`, `analyzeInterfaceToIR`, `analyzeTypeAliasToIR`
 *    produce `IRClassAnalysis` containing `FieldNode[]` and `typeRegistry` directly.
 *
 * 2. **Legacy path** (deprecated): `analyzeClass`, `analyzeInterface`, `analyzeTypeAlias`
 *    produce `ClassAnalysis` containing `FieldInfo[]` for backward compatibility
 *    with the existing JSON Schema generators (class-schema.ts, method-schema.ts).
 *    These will be removed in Phase 4 when the IR pipeline replaces the generators.
 */

import * as ts from "typescript";
import type {
  FieldNode,
  TypeNode,
  ConstraintNode,
  AnnotationNode,
  Provenance,
  ObjectProperty,
  TypeDefinition,
  NumericConstraintNode,
  LengthConstraintNode,
} from "@formspec/core";
import { extractDecorators, resolveDecorator, type DecoratorInfo } from "./decorator-extractor.js";
import {
  extractJSDocConstraints,
  extractJSDocFieldMetadata,
  extractJSDocConstraintNodes,
  extractJSDocAnnotationNodes,
  hasDeprecatedTag,
  extractDefaultValueAnnotation,
} from "./jsdoc-constraints.js";
import { parseTSDocTags } from "./tsdoc-parser.js";

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
  return !!(type.flags & ts.TypeFlags.Object) &&
    !!((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference);
}

// =============================================================================
// IR OUTPUT TYPES
// =============================================================================

/**
 * Result of analyzing a class/interface/type alias into canonical IR.
 */
export interface IRClassAnalysis {
  /** Type name */
  readonly name: string;
  /** Analyzed fields as canonical IR FieldNodes */
  readonly fields: readonly FieldNode[];
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
  const typeRegistry: Record<string, TypeDefinition> = {};
  const visiting = new Set<ts.Type>();
  const instanceMethods: MethodInfo[] = [];
  const staticMethods: MethodInfo[] = [];

  for (const member of classDecl.members) {
    if (ts.isPropertyDeclaration(member)) {
      const fieldNode = analyzeFieldToIR(member, checker, file, typeRegistry, visiting);
      if (fieldNode) {
        fields.push(fieldNode);
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

  return { name, fields, typeRegistry, instanceMethods, staticMethods };
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

  return { name, fields, typeRegistry, instanceMethods: [], staticMethods: [] };
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
    analysis: { name, fields, typeRegistry, instanceMethods: [], staticMethods: [] },
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
  const type = resolveTypeNode(tsType, checker, file, typeRegistry, visiting);

  // Collect constraints
  const constraints: ConstraintNode[] = [];

  // Inherit constraints from type alias declarations (lower precedence)
  if (prop.type) {
    constraints.push(...extractTypeAliasConstraintNodes(prop.type, checker, file));
  }

  // Extract decorator constraints (class properties have decorators)
  const decorators = extractDecorators(prop);
  for (const dec of decorators) {
    if (dec.node) {
      const resolved = resolveDecorator(dec.node, checker);
      if (resolved) {
        dec.resolved = resolved;
      }
    }
  }
  constraints.push(...extractConstraintsFromDecorators(decorators, provenance));

  // Parse JSDoc/TSDoc tags once and extract both constraints and annotations
  // to avoid running parseTSDocTags twice for the same node.
  const jsdocResult = parseTSDocTags(prop, file);

  // Extract JSDoc constraint tags (higher precedence)
  constraints.push(...jsdocResult.constraints);

  // Collect annotations
  const annotations: AnnotationNode[] = [];

  // Annotations from decorators (Field decorator)
  annotations.push(...extractAnnotationsFromDecorators(decorators, provenance));

  // JSDoc annotations (@Field_displayName, @Field_description, @deprecated)
  annotations.push(...jsdocResult.annotations);

  // Default value annotation
  const defaultAnnotation = extractDefaultValueAnnotation(prop.initializer, file);
  if (defaultAnnotation) {
    annotations.push(defaultAnnotation);
  }

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
  const type = resolveTypeNode(tsType, checker, file, typeRegistry, visiting);

  // Collect constraints
  const constraints: ConstraintNode[] = [];

  // Inherit constraints from type alias declarations
  if (prop.type) {
    constraints.push(...extractTypeAliasConstraintNodes(prop.type, checker, file));
  }

  // JSDoc constraint tags
  constraints.push(...extractJSDocConstraintNodes(prop, file));

  // Collect annotations
  const annotations: AnnotationNode[] = [];

  // JSDoc annotations (@Field_displayName, @Field_description, @deprecated)
  annotations.push(...extractJSDocAnnotationNodes(prop, file));

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
  // Treat both null and undefined as nullable — undefined is filtered from the
  // non-null members above (matching JSON Schema null semantics), so it must
  // also set hasNull so the null union member is included in the output type.
  const hasNull = allTypes.some(
    (t) => t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)
  );

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

function resolveObjectType(
  type: ts.ObjectType,
  checker: ts.TypeChecker,
  file: string,
  typeRegistry: Record<string, TypeDefinition>,
  visiting: Set<ts.Type>
): TypeNode {
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
// CONSTRAINT/ANNOTATION EXTRACTION FROM DECORATORS
// =============================================================================

/** Decorator names that map to numeric constraints. */
const NUMERIC_CONSTRAINT_MAP: Record<string, NumericConstraintNode["constraintKind"]> = {
  Minimum: "minimum",
  Maximum: "maximum",
  ExclusiveMinimum: "exclusiveMinimum",
  ExclusiveMaximum: "exclusiveMaximum",
};

/** Decorator names that map to length constraints. */
const LENGTH_CONSTRAINT_MAP: Record<string, LengthConstraintNode["constraintKind"]> = {
  MinLength: "minLength",
  MaxLength: "maxLength",
};

/**
 * Extracts IR ConstraintNodes from decorator info (for class property decorators).
 */
function extractConstraintsFromDecorators(
  decorators: DecoratorInfo[],
  provenance: Provenance
): ConstraintNode[] {
  const constraints: ConstraintNode[] = [];

  for (const dec of decorators) {
    const effectiveName = dec.resolved?.extendsBuiltin ?? dec.name;

    const numericKind = NUMERIC_CONSTRAINT_MAP[effectiveName];
    if (numericKind && typeof dec.args[0] === "number") {
      constraints.push({
        kind: "constraint",
        constraintKind: numericKind,
        value: dec.args[0],
        provenance,
      });
      continue;
    }

    const lengthKind = LENGTH_CONSTRAINT_MAP[effectiveName];
    if (lengthKind && typeof dec.args[0] === "number") {
      constraints.push({
        kind: "constraint",
        constraintKind: lengthKind,
        value: dec.args[0],
        provenance,
      });
      continue;
    }

    if (effectiveName === "Pattern" && typeof dec.args[0] === "string") {
      constraints.push({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: dec.args[0],
        provenance,
      });
    }
  }

  return constraints;
}

/**
 * Extracts IR AnnotationNodes from decorator info (for class property decorators).
 */
function extractAnnotationsFromDecorators(
  decorators: DecoratorInfo[],
  provenance: Provenance
): AnnotationNode[] {
  const annotations: AnnotationNode[] = [];

  for (const dec of decorators) {
    const effectiveName = dec.resolved?.extendsBuiltin ?? dec.name;
    if (effectiveName === "Field") {
      const opts = dec.args[0];
      if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
        if (typeof opts["displayName"] === "string") {
          annotations.push({
            kind: "annotation",
            annotationKind: "displayName",
            value: opts["displayName"],
            provenance,
          });
        }
        if (typeof opts["description"] === "string") {
          annotations.push({
            kind: "annotation",
            annotationKind: "description",
            value: opts["description"],
            provenance,
          });
        }
        if (typeof opts["placeholder"] === "string") {
          annotations.push({
            kind: "annotation",
            annotationKind: "placeholder",
            value: opts["placeholder"],
            provenance,
          });
        }
      }
    }
  }

  return annotations;
}

// =============================================================================
// TYPE ALIAS CONSTRAINT PROPAGATION
// =============================================================================

/**
 * Given a type node referencing a type alias, extracts IR ConstraintNodes
 * from the alias declaration's JSDoc tags.
 */
function extractTypeAliasConstraintNodes(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  file: string
): ConstraintNode[] {
  if (!ts.isTypeReferenceNode(typeNode)) return [];

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  if (!symbol?.declarations) return [];

  const aliasDecl = symbol.declarations.find(ts.isTypeAliasDeclaration);
  if (!aliasDecl) return [];

  // Don't extract from object type aliases
  if (ts.isTypeLiteralNode(aliasDecl.type)) return [];

  return extractJSDocConstraintNodes(aliasDecl, file);
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
// LEGACY OUTPUT TYPES — backward compatibility
// =============================================================================

/**
 * Analyzed field information from a class.
 * @deprecated Use {@link FieldNode} from the IR analysis path instead.
 */
export interface FieldInfo {
  /** Field name */
  name: string;
  /** TypeScript type node for the field */
  typeNode: ts.TypeNode | undefined;
  /** Resolved type from the type checker */
  type: ts.Type;
  /** Whether the field is optional (has ? modifier) */
  optional: boolean;
  /** Decorators applied to the field */
  decorators: DecoratorInfo[];
  /** Whether the field has a TSDoc @deprecated tag */
  deprecated: boolean;
  /** Default value extracted from the property initializer (literal values only) */
  defaultValue: unknown;
}

/**
 * Result of analyzing a class declaration.
 * @deprecated Use {@link IRClassAnalysis} instead.
 */
export interface ClassAnalysis {
  /** Class name */
  name: string;
  /** Analyzed fields */
  fields: FieldInfo[];
  /** Instance methods */
  instanceMethods: MethodInfo[];
  /** Static methods */
  staticMethods: MethodInfo[];
}

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
// LEGACY ANALYSIS — backward compatibility
// =============================================================================

/**
 * Result of analyzing a type alias.
 * @deprecated Use {@link AnalyzeTypeAliasToIRResult} instead.
 */
export type AnalyzeTypeAliasResult =
  | { ok: true; analysis: ClassAnalysis }
  | { ok: false; error: string };

/**
 * Analyzes a class declaration to extract fields and methods.
 * @deprecated Use {@link analyzeClassToIR} for IR output.
 */
export function analyzeClass(
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker
): ClassAnalysis {
  const name = classDecl.name?.text ?? "AnonymousClass";
  const fields: FieldInfo[] = [];
  const instanceMethods: MethodInfo[] = [];
  const staticMethods: MethodInfo[] = [];

  for (const member of classDecl.members) {
    if (ts.isPropertyDeclaration(member)) {
      const fieldInfo = analyzeField(member, checker);
      if (fieldInfo) {
        fields.push(fieldInfo);
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

  return { name, fields, instanceMethods, staticMethods };
}

/**
 * Analyzes a property declaration to extract field info.
 * @deprecated Used by legacy analysis path.
 */
export function analyzeField(
  prop: ts.PropertyDeclaration,
  checker: ts.TypeChecker
): FieldInfo | null {
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const typeNode = prop.type;
  const type = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const decorators = extractDecorators(prop);

  for (const dec of decorators) {
    if (dec.node) {
      const resolved = resolveDecorator(dec.node, checker);
      if (resolved) {
        dec.resolved = resolved;
      }
    }
  }

  if (prop.type) {
    const aliasConstraints = extractTypeAliasConstraintsLegacy(prop.type, checker);
    decorators.push(...aliasConstraints);
  }

  const jsdocConstraints = extractJSDocConstraints(prop);
  decorators.push(...jsdocConstraints);

  const deprecated = hasDeprecatedTag(prop);
  const defaultValue = extractDefaultValueLegacy(prop.initializer);

  return { name, typeNode, type, optional, decorators, deprecated, defaultValue };
}

/**
 * Analyzes an interface declaration.
 * @deprecated Use {@link analyzeInterfaceToIR} for IR output.
 */
export function analyzeInterface(
  interfaceDecl: ts.InterfaceDeclaration,
  checker: ts.TypeChecker
): ClassAnalysis {
  const name = interfaceDecl.name.text;
  const fields: FieldInfo[] = [];

  for (const member of interfaceDecl.members) {
    if (ts.isPropertySignature(member)) {
      const fieldInfo = analyzeInterfaceProperty(member, checker);
      if (fieldInfo) {
        fields.push(fieldInfo);
      }
    }
  }

  return { name, fields, instanceMethods: [], staticMethods: [] };
}

/**
 * Analyzes a type alias declaration.
 * @deprecated Use {@link analyzeTypeAliasToIR} for IR output.
 */
export function analyzeTypeAlias(
  typeAlias: ts.TypeAliasDeclaration,
  checker: ts.TypeChecker
): AnalyzeTypeAliasResult {
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
  const fields: FieldInfo[] = [];

  for (const member of typeAlias.type.members) {
    if (ts.isPropertySignature(member)) {
      const fieldInfo = analyzeInterfaceProperty(member, checker);
      if (fieldInfo) {
        fields.push(fieldInfo);
      }
    }
  }

  return {
    ok: true,
    analysis: { name, fields, instanceMethods: [], staticMethods: [] },
  };
}

/**
 * Analyzes an interface property signature.
 * @deprecated Used by legacy analysis path.
 */
export function analyzeInterfaceProperty(
  prop: ts.PropertySignature,
  checker: ts.TypeChecker
): FieldInfo | null {
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const typeNode = prop.type;
  const type = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const decorators: DecoratorInfo[] = [];

  if (typeNode) {
    const aliasConstraints = extractTypeAliasConstraintsLegacy(typeNode, checker);
    decorators.push(...aliasConstraints);
  }

  const fieldMetadata = extractJSDocFieldMetadata(prop);
  if (fieldMetadata) {
    decorators.push(fieldMetadata);
  }

  const jsdocConstraints = extractJSDocConstraints(prop);
  decorators.push(...jsdocConstraints);

  const deprecated = hasDeprecatedTag(prop);

  return { name, typeNode, type, optional, decorators, deprecated, defaultValue: undefined };
}

// =============================================================================
// LEGACY HELPERS
// =============================================================================

function extractTypeAliasConstraintsLegacy(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): DecoratorInfo[] {
  if (!ts.isTypeReferenceNode(typeNode)) return [];

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  if (!symbol?.declarations) return [];

  const aliasDecl = symbol.declarations.find(ts.isTypeAliasDeclaration);
  if (!aliasDecl) return [];

  if (ts.isTypeLiteralNode(aliasDecl.type)) return [];

  return extractJSDocConstraints(aliasDecl);
}

function extractDefaultValueLegacy(initializer: ts.Expression | undefined): unknown {
  if (!initializer) return undefined;

  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isNumericLiteral(initializer)) return Number(initializer.text);
  if (initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (initializer.kind === ts.SyntaxKind.NullKeyword) return null;

  if (ts.isPrefixUnaryExpression(initializer)) {
    if (
      initializer.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(initializer.operand)
    ) {
      return -Number(initializer.operand.text);
    }
  }

  return undefined;
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
