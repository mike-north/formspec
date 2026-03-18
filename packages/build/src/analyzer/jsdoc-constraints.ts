/**
 * JSDoc constraint tag extractor.
 *
 * Extracts constraint tags from JSDoc comments on class fields and returns
 * synthetic {@link DecoratorInfo} objects that integrate seamlessly with
 * the existing decorator-based constraint pipeline.
 *
 * Supported tags correspond to keys in {@link CONSTRAINT_TAG_DEFINITIONS}
 * from `@formspec/core` (e.g., `@Minimum`, `@Maximum`, `@Pattern`).
 */

import * as ts from "typescript";
import { CONSTRAINT_TAG_DEFINITIONS, type ConstraintTagName } from "@formspec/core";
import type { DecoratorInfo } from "./decorator-extractor.js";

/**
 * Extracts JSDoc constraint tags from a TypeScript AST node and returns
 * synthetic {@link DecoratorInfo} objects.
 *
 * For each recognised tag (case-sensitive PascalCase match against
 * {@link CONSTRAINT_TAG_DEFINITIONS}), the comment text is parsed
 * according to the tag's declared value type:
 * - `"number"` tags: parsed via `Number()` — skipped when NaN
 * - `"string"` tags (`Pattern`): used as-is (trimmed)
 *
 * @param node - The AST node to inspect for JSDoc tags
 * @returns Synthetic decorator info objects for each valid constraint tag
 */
export function extractJSDocConstraints(node: ts.Node): DecoratorInfo[] {
  const results: DecoratorInfo[] = [];
  const jsDocTags = ts.getJSDocTags(node);

  for (const tag of jsDocTags) {
    const tagName = tag.tagName.text;

    // Case-sensitive check against known constraint tags
    if (!(tagName in CONSTRAINT_TAG_DEFINITIONS)) {
      continue;
    }

    const constraintName = tagName as ConstraintTagName;
    const expectedType = CONSTRAINT_TAG_DEFINITIONS[constraintName];

    // Extract comment text — can be string, NodeArray<JSDocComment>, or undefined
    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText === "") {
      continue;
    }

    const trimmed = commentText.trim();
    if (trimmed === "") {
      continue;
    }

    if (expectedType === "number") {
      const value = Number(trimmed);
      if (Number.isNaN(value)) {
        continue;
      }
      results.push(createSyntheticDecorator(constraintName, value));
    } else {
      // "string" type (Pattern)
      results.push(createSyntheticDecorator(constraintName, trimmed));
    }
  }

  return results;
}

/**
 * Extracts the text content from a JSDoc tag's comment.
 *
 * The `tag.comment` property can be a plain string, an array of
 * `JSDocComment` nodes, or undefined. This helper normalises all
 * three cases to a single `string | undefined`.
 */
function getTagCommentText(tag: ts.JSDocTag): string | undefined {
  if (tag.comment === undefined) {
    return undefined;
  }
  if (typeof tag.comment === "string") {
    return tag.comment;
  }
  // NodeArray<JSDocComment> — concatenate text spans
  return ts.getTextOfJSDocComment(tag.comment);
}

/**
 * Creates a synthetic {@link DecoratorInfo} for a JSDoc constraint tag.
 *
 * The `node` field is `undefined` because JSDoc constraints have no
 * decorator AST node. Downstream constraint processing only uses
 * the `name` and `args` fields.
 */
function createSyntheticDecorator(name: string, value: string | number): DecoratorInfo {
  return {
    name,
    args: [value],
    node: undefined,
  };
}
