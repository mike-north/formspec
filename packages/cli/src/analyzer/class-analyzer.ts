/**
 * Class analyzer for extracting fields, types, and decorators.
 *
 * Analyzes a TypeScript class declaration to extract:
 * - Field names and TypeScript types
 * - Decorator metadata (Label, Min, Max, etc.)
 * - Field optionality
 */

import * as ts from "typescript";
import { extractDecorators, type DecoratorInfo } from "./decorator-extractor.js";

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
        const isStatic = member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.StaticKeyword
        );
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
function analyzeField(
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

  return {
    name,
    typeNode,
    type,
    optional,
    decorators,
  };
}

/**
 * Analyzes a method declaration to extract method info.
 */
function analyzeMethod(
  method: ts.MethodDeclaration,
  checker: ts.TypeChecker
): MethodInfo | null {
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
function analyzeParameter(
  param: ts.ParameterDeclaration,
  checker: ts.TypeChecker
): ParameterInfo {
  const name = ts.isIdentifier(param.name) ? param.name.text : "param";
  const typeNode = param.type;
  const type = checker.getTypeAtLocation(param);
  const formSpecExportName = detectFormSpecReference(typeNode);

  return {
    name,
    typeNode,
    type,
    formSpecExportName,
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
