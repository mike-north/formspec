import * as ts from "typescript";
import { resolveDeclarationPlacement } from "./ts-binding.js";

/**
 * Returns the last leading TSDoc/JSDoc block attached to a declaration node.
 */
export function getLastLeadingDocCommentRange(
  node: ts.Node,
  sourceFile: ts.SourceFile
): ts.CommentRange | null {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? [];
  const docRanges = ranges.filter((range) =>
    sourceFile.text.slice(range.pos, range.end).startsWith("/**")
  );
  return docRanges.length === 0 ? null : (docRanges[docRanges.length - 1] ?? null);
}

/**
 * Resolves the direct subject type for declarations that can carry FormSpec
 * comment tags.
 */
export function getSubjectType(node: ts.Node, checker: ts.TypeChecker): ts.Type | undefined {
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isParameter(node)
  ) {
    return checker.getTypeAtLocation(node);
  }

  return undefined;
}

/**
 * Resolves the enclosing host type for declarations nested under a containing
 * class, interface, or type literal.
 */
export function getHostType(node: ts.Node, checker: ts.TypeChecker): ts.Type | undefined {
  const parent = node.parent;
  if (
    ts.isClassDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeLiteralNode(parent) ||
    ts.isTypeAliasDeclaration(parent)
  ) {
    return checker.getTypeAtLocation(parent);
  }

  return getSubjectType(node, checker);
}

/**
 * Finds the smallest declaration whose leading doc comment contains the given
 * source offset.
 */
export function findDeclarationForCommentOffset(
  sourceFile: ts.SourceFile,
  offset: number
): ts.Node | null {
  let bestMatch: ts.Node | null = null;

  const visit = (node: ts.Node): void => {
    if (resolveDeclarationPlacement(node) !== null) {
      const range = getLastLeadingDocCommentRange(node, sourceFile);
      if (range !== null && offset >= range.pos && offset <= range.end) {
        if (bestMatch === null || node.getWidth(sourceFile) < bestMatch.getWidth(sourceFile)) {
          bestMatch = node;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return bestMatch;
}
