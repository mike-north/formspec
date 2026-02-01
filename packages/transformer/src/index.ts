/**
 * @formspec/transformer
 *
 * TypeScript transformer that emits type metadata for decorated classes.
 *
 * This transformer runs at compile time and adds a static `__formspec_types__`
 * property to any class that has decorated properties. This enables runtime
 * access to full TypeScript type information that would otherwise be erased.
 *
 * @example
 * ```typescript
 * // Input
 * class MyForm {
 *   @Label("Country")
 *   country!: "us" | "ca" | "uk";
 * }
 *
 * // Output (after transformation)
 * class MyForm {
 *   static __formspec_types__ = {
 *     country: { type: "enum", values: ["us", "ca", "uk"] }
 *   };
 *
 *   @Label("Country")
 *   country!: "us" | "ca" | "uk";
 * }
 * ```
 *
 * @packageDocumentation
 */

import * as ts from "typescript";
import {
  extractTypeMetadata,
  typeMetadataToAst,
} from "./type-extractor";

export type { TypeMetadata } from "./type-extractor";

/**
 * The name of the static property added to transformed classes.
 */
export const FORMSPEC_TYPES_KEY = "__formspec_types__";

/**
 * Creates the FormSpec TypeScript transformer.
 *
 * This transformer is designed to work with ts-patch. Add it to your
 * tsconfig.json plugins:
 *
 * ```json
 * {
 *   "compilerOptions": {
 *     "plugins": [{ "transform": "@formspec/transformer" }]
 *   }
 * }
 * ```
 *
 * @param program - The TypeScript program
 * @returns A transformer factory
 */
export default function transformer(
  program: ts.Program
): ts.TransformerFactory<ts.SourceFile> {
  const checker = program.getTypeChecker();

  return (context) => {
    return (sourceFile) => {
      function visit(node: ts.Node): ts.Node {
        // Only transform class declarations with decorated properties
        if (ts.isClassDeclaration(node) && hasDecoratedProperties(node)) {
          return addTypeMetadata(node, checker, context);
        }
        return ts.visitEachChild(node, visit, context);
      }

      return ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
  };
}

/**
 * Checks if a class declaration has any decorated properties.
 */
function hasDecoratedProperties(node: ts.ClassDeclaration): boolean {
  return node.members.some((member) => {
    if (!ts.isPropertyDeclaration(member)) return false;
    const decorators = ts.getDecorators(member);
    return decorators !== undefined && decorators.length > 0;
  });
}

/**
 * Adds the __formspec_types__ static property to a class declaration.
 */
function addTypeMetadata(
  classNode: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  context: ts.TransformationContext
): ts.ClassDeclaration {
  const factory = context.factory;
  const metadata = extractTypeMetadata(classNode, checker);

  // Create: static __formspec_types__ = { ... }
  const metadataProperty = factory.createPropertyDeclaration(
    [factory.createModifier(ts.SyntaxKind.StaticKeyword)],
    FORMSPEC_TYPES_KEY,
    undefined,
    undefined,
    factory.createObjectLiteralExpression(
      Object.entries(metadata).map(([name, typeInfo]) =>
        factory.createPropertyAssignment(name, typeMetadataToAst(typeInfo, factory))
      ),
      true
    )
  );

  return factory.updateClassDeclaration(
    classNode,
    classNode.modifiers,
    classNode.name,
    classNode.typeParameters,
    classNode.heritageClauses,
    [metadataProperty, ...classNode.members]
  );
}
