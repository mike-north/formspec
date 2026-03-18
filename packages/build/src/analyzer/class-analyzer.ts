/**
 * Class analyzer for extracting fields, types, and decorators.
 *
 * Analyzes a TypeScript class declaration to extract:
 * - Field names and TypeScript types
 * - Decorator metadata (Field, Minimum, Maximum, etc.)
 * - Field optionality
 * - TSDoc @deprecated tags
 * - Default values from property initializers
 */

import * as ts from "typescript";
import { extractDecorators, resolveDecorator, type DecoratorInfo } from "./decorator-extractor.js";
import { extractJSDocConstraints, extractJSDocFieldMetadata } from "./jsdoc-constraints.js";

/**
 * Analyzed field information from a class.
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

/**
 * Analyzes a class declaration to extract fields and methods.
 *
 * @param classDecl - The class declaration to analyze
 * @param checker - TypeScript type checker
 * @returns Analysis result with fields and methods
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

  return {
    name,
    fields,
    instanceMethods,
    staticMethods,
  };
}

/**
 * Analyzes a property declaration to extract field info.
 */
export function analyzeField(
  prop: ts.PropertyDeclaration,
  checker: ts.TypeChecker
): FieldInfo | null {
  // Skip computed property names
  if (!ts.isIdentifier(prop.name)) {
    return null;
  }

  const name = prop.name.text;
  const typeNode = prop.type;
  const type = checker.getTypeAtLocation(prop);
  const optional = prop.questionToken !== undefined;
  const decorators = extractDecorators(prop);

  // Resolve each decorator via the type checker to detect extended/custom decorators
  for (const dec of decorators) {
    if (dec.node) {
      const resolved = resolveDecorator(dec.node, checker);
      if (resolved) {
        dec.resolved = resolved;
      }
    }
  }

  // Inherit constraints from type alias declarations first (as defaults).
  // Field-level decorators and JSDoc are applied after, so they take precedence.
  if (prop.type) {
    const aliasConstraints = extractTypeAliasConstraints(prop.type, checker);
    decorators.push(...aliasConstraints);
  }

  // Merge JSDoc constraint tags (e.g., /** @Minimum 0 @Maximum 100 */)
  const jsdocConstraints = extractJSDocConstraints(prop);
  decorators.push(...jsdocConstraints);

  const deprecated = hasDeprecatedTag(prop);
  const defaultValue = extractDefaultValue(prop.initializer);

  return {
    name,
    typeNode,
    type,
    optional,
    decorators,
    deprecated,
    defaultValue,
  };
}

/**
 * Given a type node, checks if it references a type alias and extracts
 * JSDoc constraint tags from the alias declaration.
 *
 * Only constraint tags (`@Minimum`, `@Maximum`, `@Pattern`, etc.) are
 * propagated — display metadata (`@Field_displayName`, `@Field_description`)
 * is intentionally excluded because display metadata is a field-level
 * concern, not a type-level one.
 *
 * This makes `type Percent = number` with `@Minimum 0 @Maximum 100`
 * propagate constraints to any field typed as `Percent`.
 */
function extractTypeAliasConstraints(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker
): DecoratorInfo[] {
  // Only handle type references (e.g., `Percent`, not `number` directly)
  if (!ts.isTypeReferenceNode(typeNode)) return [];

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  if (!symbol?.declarations) return [];

  const aliasDecl = symbol.declarations.find(ts.isTypeAliasDeclaration);
  if (!aliasDecl) return [];

  // Don't extract from object type aliases — those are handled by
  // the nested object analysis pipeline in type-converter.ts
  if (ts.isTypeLiteralNode(aliasDecl.type)) return [];

  // Only propagate constraint tags, not display metadata (@Field_displayName,
  // @Field_description). Display metadata on the alias shouldn't override the
  // field's own title/description — those are field-level concerns.
  return extractJSDocConstraints(aliasDecl);
}

/**
 * Checks if a node has a TSDoc `@deprecated` tag.
 */
function hasDeprecatedTag(node: ts.Node): boolean {
  const jsDocTags = ts.getJSDocTags(node);
  return jsDocTags.some((tag) => tag.tagName.text === "deprecated");
}

/**
 * Extracts a default value from a property initializer.
 *
 * Only extracts literal values (strings, numbers, booleans, null).
 * Non-literal initializers (function calls, expressions, etc.) return undefined.
 */
function extractDefaultValue(initializer: ts.Expression | undefined): unknown {
  if (!initializer) return undefined;

  // String literal
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }

  // Numeric literal
  if (ts.isNumericLiteral(initializer)) {
    return Number(initializer.text);
  }

  // Boolean literals
  if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  // Null literal
  if (initializer.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  // Negative number
  if (ts.isPrefixUnaryExpression(initializer)) {
    if (
      initializer.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(initializer.operand)
    ) {
      return -Number(initializer.operand.text);
    }
  }

  // Non-literal initializer — can't extract statically
  return undefined;
}

/**
 * Analyzes a method declaration to extract method info.
 */
function analyzeMethod(method: ts.MethodDeclaration, checker: ts.TypeChecker): MethodInfo | null {
  // Skip computed method names
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

  return {
    name,
    parameters,
    returnTypeNode,
    returnType,
  };
}

/**
 * Analyzes a parameter declaration.
 */
function analyzeParameter(param: ts.ParameterDeclaration, checker: ts.TypeChecker): ParameterInfo {
  const name = ts.isIdentifier(param.name) ? param.name.text : "param";
  const typeNode = param.type;
  const type = checker.getTypeAtLocation(param);
  const formSpecExportName = detectFormSpecReference(typeNode);
  // Parameter is optional if it has a question token or a default value
  const optional = param.questionToken !== undefined || param.initializer !== undefined;

  return {
    name,
    typeNode,
    type,
    formSpecExportName,
    optional,
  };
}

/**
 * Detects if a type node is InferSchema<typeof X> or InferFormSchema<typeof X> and extracts X.
 *
 * @param typeNode - The type node to check
 * @returns The export name X, or null if not a FormSpec inference pattern
 */
function detectFormSpecReference(typeNode: ts.TypeNode | undefined): string | null {
  if (!typeNode) return null;

  // Looking for: InferSchema<typeof X> or InferFormSchema<typeof X>
  if (!ts.isTypeReferenceNode(typeNode)) return null;

  // Get the type name - could be Identifier or QualifiedName
  const typeName = ts.isIdentifier(typeNode.typeName)
    ? typeNode.typeName.text
    : ts.isQualifiedName(typeNode.typeName)
      ? typeNode.typeName.right.text
      : null;

  // Support both InferSchema (for elements) and InferFormSchema (for FormSpec)
  if (typeName !== "InferSchema" && typeName !== "InferFormSchema") return null;

  const typeArg = typeNode.typeArguments?.[0];
  if (!typeArg || !ts.isTypeQueryNode(typeArg)) return null;

  // typeArg.exprName is the identifier (e.g., "ActivateParams")
  if (ts.isIdentifier(typeArg.exprName)) {
    return typeArg.exprName.text;
  }

  // Could be qualified name like Namespace.ActivateParams
  if (ts.isQualifiedName(typeArg.exprName)) {
    return typeArg.exprName.right.text;
  }

  return null;
}

/**
 * Analyzes an interface declaration to extract field information.
 *
 * Similar to {@link analyzeClass} but for interface declarations.
 * Extracts JSDoc constraint tags (`@Minimum`, `@MaxLength`, etc.) and
 * display metadata (`@Field_displayName`, `@Field_description`) from
 * property signatures, producing the same {@link ClassAnalysis}
 * structure for downstream schema generation.
 *
 * @param interfaceDecl - The interface declaration to analyze
 * @param checker - TypeScript type checker
 * @returns Analysis result with fields (no methods — interfaces have no implementations)
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

  return {
    name,
    fields,
    instanceMethods: [],
    staticMethods: [],
  };
}

/**
 * Result of analyzing a type alias — either a successful analysis or
 * an error describing why the alias can't be analyzed.
 */
export type AnalyzeTypeAliasResult =
  | { ok: true; analysis: ClassAnalysis }
  | { ok: false; error: string };

/**
 * Analyzes a type alias declaration to extract field information.
 *
 * Supports type aliases whose body is a type literal (object type):
 *
 * ```typescript
 * type Config = {
 *   // @Field_displayName Name @Minimum 1
 *   name: string;
 * };
 * ```
 *
 * Returns an error result (not an exception) for non-object-literal aliases,
 * allowing callers to accumulate diagnostics across multiple types.
 *
 * @param typeAlias - The type alias declaration to analyze
 * @param checker - TypeScript type checker
 * @returns Success with analysis, or error with a diagnostic message including line number
 */
export function analyzeTypeAlias(
  typeAlias: ts.TypeAliasDeclaration,
  checker: ts.TypeChecker
): AnalyzeTypeAliasResult {
  // Only handle type literals: type X = { ... }
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
    analysis: {
      name,
      fields,
      instanceMethods: [],
      staticMethods: [],
    },
  };
}

/**
 * Analyzes an interface property signature to extract field info.
 *
 * Extracts JSDoc constraint tags (`@Minimum`, `@MaxLength`, etc.) and
 * display metadata (`@DisplayName`, `@Description`) from the property's
 * TSDoc comments. Also used by the type converter for nested interface/type
 * alias constraint propagation.
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

  // Interface properties have no decorators — only JSDoc tags
  const decorators: DecoratorInfo[] = [];

  // Inherit constraints from type alias declarations first (as defaults).
  // Field-level tags are applied after, so they take precedence.
  if (typeNode) {
    const aliasConstraints = extractTypeAliasConstraints(typeNode, checker);
    decorators.push(...aliasConstraints);
  }

  // Extract display metadata (@Field_displayName, @Field_description) as synthetic Field decorator
  const fieldMetadata = extractJSDocFieldMetadata(prop);
  if (fieldMetadata) {
    decorators.push(fieldMetadata);
  }

  // Extract constraint tags (@Minimum, @MaxLength, @Pattern, etc.)
  const jsdocConstraints = extractJSDocConstraints(prop);
  decorators.push(...jsdocConstraints);

  const deprecated = hasDeprecatedTag(prop);

  return {
    name,
    typeNode,
    type,
    optional,
    decorators,
    deprecated,
    defaultValue: undefined,
  };
}
