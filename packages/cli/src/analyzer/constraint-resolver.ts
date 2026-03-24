/**
 * Resolves constraint inheritance through type alias chains.
 *
 * When a type alias has TSDoc constraint tags, those constraints
 * propagate to use sites. Constraints are merged per spec:
 * - minimum: use the maximum (most restrictive) of all values
 * - maximum: use the minimum (most restrictive) of all values
 * - multipleOf: collect all values
 * - minLength/maxLength: same as minimum/maximum
 * - pattern: collect all (all must match)
 */

import * as ts from "typescript";
import { extractCommentTags, type CommentTagInfo } from "./comment-tag-extractor.js";

/**
 * A single entry in a type alias chain, describing one alias level.
 */
export interface AliasChainEntry {
  /** The alias name (e.g. "Integer", "Percentage") */
  name: string;
  /** TSDoc constraint tags declared directly on this alias */
  tags: CommentTagInfo[];
  /**
   * The name of the parent alias if this alias extends another named type alias.
   * Undefined when the parent is a plain primitive (number, string, etc.).
   */
  parentName: string | undefined;
}

/**
 * Collected constraints from a type alias chain.
 */
export interface ResolvedConstraints {
  /** Merged constraint tags */
  tags: CommentTagInfo[];
  /** Diagnostic messages (warnings/errors) */
  diagnostics: ConstraintDiagnostic[];
  /**
   * Per-level alias chain info for allOf + $ref composition.
   * Ordered leaf-first (most specific alias first, root alias last).
   */
  aliasChain: AliasChainEntry[];
}

export interface ConstraintDiagnostic {
  severity: "error" | "warning";
  message: string;
}

/**
 * Resolves constraints from a type alias chain starting from a type node.
 *
 * When a field's type annotation is a TypeReferenceNode pointing to a type
 * alias, this function walks the alias chain and collects all constraint
 * tags. Field-level tags (passed separately to applyCommentTagsToSchema)
 * override type-level tags for scalar constraints.
 *
 * @param typeNode - The type node from the field declaration
 * @param checker - TypeScript type checker
 */
export function resolveTypeConstraints(
  typeNode: ts.TypeNode | undefined,
  checker: ts.TypeChecker
): ResolvedConstraints {
  if (!typeNode) {
    return { tags: [], diagnostics: [], aliasChain: [] };
  }

  const allTagSets: CommentTagInfo[][] = [];
  const aliasChain: AliasChainEntry[] = [];
  const diagnostics: ConstraintDiagnostic[] = [];
  const visited = new Set<ts.Symbol>();

  collectTagsFromTypeNode(typeNode, checker, allTagSets, aliasChain, visited);

  if (allTagSets.length === 0) {
    return { tags: [], diagnostics, aliasChain };
  }

  // allTagSets is in leaf-first order; reverse so root comes first,
  // then leaf constraints win on scalar overrides.
  const merged = mergeConstraintSets(allTagSets.reverse(), diagnostics);

  return { tags: merged, diagnostics, aliasChain };
}

/**
 * Walks a TypeNode to collect constraint tags from the alias chain.
 * For TypeReferenceNodes, looks up the symbol and recurses into its declaration.
 * Results are appended in leaf-first order (current level before parents).
 *
 * Also populates `aliasChain` with per-level information for allOf + $ref
 * composition. aliasChain entries are appended leaf-first.
 */
function collectTagsFromTypeNode(
  typeNode: ts.TypeNode,
  checker: ts.TypeChecker,
  tagSets: CommentTagInfo[][],
  aliasChain: AliasChainEntry[],
  visited: Set<ts.Symbol>
): void {
  if (!ts.isTypeReferenceNode(typeNode)) return;

  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  if (!symbol) return;

  // Guard against cycles
  if (visited.has(symbol)) return;
  visited.add(symbol);

  const declarations = symbol.getDeclarations();
  if (!declarations) return;

  for (const decl of declarations) {
    if (!ts.isTypeAliasDeclaration(decl)) continue;

    // Collect tags from this alias level
    const tags = extractCommentTags(decl);
    if (tags.length > 0) {
      tagSets.push(tags);
    }

    // Determine parent alias name (if the aliased type is itself a named alias)
    let parentName: string | undefined;
    if (ts.isTypeReferenceNode(decl.type)) {
      const parentSymbol = checker.getSymbolAtLocation(decl.type.typeName);
      if (parentSymbol) {
        const parentDecls = parentSymbol.getDeclarations();
        if (parentDecls?.some((d) => ts.isTypeAliasDeclaration(d))) {
          // Parent is a type alias — capture its name
          parentName = ts.isIdentifier(decl.type.typeName)
            ? decl.type.typeName.text
            : undefined;
        }
      }
    }

    // Add entry for this alias (even if no tags, so the chain is complete
    // for $ref purposes when a child alias needs to know its parent)
    aliasChain.push({ name: decl.name.text, tags, parentName });

    // Recurse into the aliased type node if it's also a type reference
    if (ts.isTypeReferenceNode(decl.type)) {
      collectTagsFromTypeNode(decl.type, checker, tagSets, aliasChain, visited);
    }
  }
}

/**
 * Merges multiple sets of constraint tags and detects broadening violations.
 *
 * Sets should be ordered from root (most general) to leaf (most specific).
 * Leaf-level constraints override root-level for scalar tags.
 *
 * Broadening is when a derived alias attempts to relax a parent constraint:
 * - min-like tags (minimum, minLength, minItems): broadening = child value < parent value
 * - max-like tags (maximum, maxLength, maxItems): broadening = child value > parent value
 */
function mergeConstraintSets(
  tagSets: CommentTagInfo[][],
  diagnostics: ConstraintDiagnostic[]
): CommentTagInfo[] {
  const merged = new Map<string, CommentTagInfo>();
  const multipleOfs: number[] = [];
  const patterns: string[] = [];

  for (const tags of tagSets) {
    for (const tag of tags) {
      switch (tag.tagName) {
        case "minimum":
        case "minLength":
        case "minItems": {
          // Most restrictive = maximum of all values
          const existing = merged.get(tag.tagName);
          if (
            existing !== undefined &&
            typeof existing.value === "number" &&
            typeof tag.value === "number"
          ) {
            if (tag.value < existing.value) {
              // Derived alias lowers the minimum — that is broadening
              diagnostics.push({
                severity: "error",
                message: `CONSTRAINT_BROADENING — @${tag.tagName} ${String(tag.value)} attempts to broaden inherited @${tag.tagName} ${String(existing.value)}. Constraints can only narrow, not broaden (S1).`,
              });
            }
            merged.set(tag.tagName, {
              tagName: tag.tagName,
              value: Math.max(existing.value, tag.value),
            });
          } else {
            merged.set(tag.tagName, tag);
          }
          break;
        }

        case "maximum":
        case "maxLength":
        case "maxItems": {
          // Most restrictive = minimum of all values
          const existing = merged.get(tag.tagName);
          if (
            existing !== undefined &&
            typeof existing.value === "number" &&
            typeof tag.value === "number"
          ) {
            if (tag.value > existing.value) {
              // Derived alias raises the maximum — that is broadening
              diagnostics.push({
                severity: "error",
                message: `CONSTRAINT_BROADENING — @${tag.tagName} ${String(tag.value)} attempts to broaden inherited @${tag.tagName} ${String(existing.value)}. Constraints can only narrow, not broaden (S1).`,
              });
            }
            merged.set(tag.tagName, {
              tagName: tag.tagName,
              value: Math.min(existing.value, tag.value),
            });
          } else {
            merged.set(tag.tagName, tag);
          }
          break;
        }

        case "multipleOf":
          // Collect all values — every multipleOf must be satisfied
          if (typeof tag.value === "number") {
            multipleOfs.push(tag.value);
          }
          break;

        case "pattern":
          // Collect all patterns — every pattern must match
          if (typeof tag.value === "string") {
            patterns.push(tag.value);
          }
          break;

        default:
          // For other tags (displayName, description, deprecated, etc.)
          // leaf overrides root (last write wins as we iterate root→leaf)
          merged.set(tag.tagName, tag);
          break;
      }
    }
  }

  const result = [...merged.values()];

  for (const value of multipleOfs) {
    result.push({ tagName: "multipleOf", value });
  }

  for (const value of patterns) {
    result.push({ tagName: "pattern", value });
  }

  return result;
}
