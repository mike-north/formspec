/**
 * Completion provider for FormSpec JSDoc constraint tags.
 *
 * Uses the shared tag registry from `@formspec/analysis` so completions stay
 * aligned with the same metadata that powers linting and build-time analysis.
 */

import {
  type FormSpecSerializedCompletionContext,
  type FormSpecSerializedTagDefinition,
  getConstraintTagDefinitions,
  getSemanticCommentCompletionContextAtOffset,
  type TagDefinition,
} from "@formspec/analysis/internal";
import type { ExtensionDefinition } from "@formspec/core/internals";
import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node.js";

/**
 * Returns the full set of tag-name completions currently known to FormSpec.
 *
 * @public
 */
export function getCompletionItems(extensions?: readonly ExtensionDefinition[]): CompletionItem[] {
  return getConstraintTagDefinitions(extensions).map((tag) => ({
    label: `@${tag.canonicalName}`,
    kind: CompletionItemKind.Keyword,
    detail: tag.completionDetail,
  }));
}

function toCompletionItem(tag: TagDefinition | FormSpecSerializedTagDefinition): CompletionItem {
  return {
    label: `@${tag.canonicalName}`,
    kind: CompletionItemKind.Keyword,
    detail: tag.completionDetail,
  };
}

function toTargetCompletionItems(
  tagName: string,
  targetCompletions: readonly string[]
): CompletionItem[] {
  return targetCompletions.map((target: string) => ({
    label: target,
    kind:
      target === "singular" || target === "plural"
        ? CompletionItemKind.EnumMember
        : CompletionItemKind.Field,
    detail: `Target for @${tagName}`,
  }));
}

function filterTagNameCompletionItems(
  prefix: string,
  availableTags: readonly (TagDefinition | FormSpecSerializedTagDefinition)[]
): CompletionItem[] {
  const normalizedPrefix = prefix.toLowerCase();
  return availableTags
    .map(toCompletionItem)
    .filter((item) => item.label.slice(1).toLowerCase().startsWith(normalizedPrefix));
}

/**
 * Returns completion items for the cursor position at `offset` in `documentText`.
 *
 * When `semanticContext` is supplied (e.g. from {@link getPluginCompletionContextForDocument}),
 * it is used directly to produce target-value or tag-name completions. Pass `null` or omit it
 * to fall back to syntax-only analysis, which works without the TypeScript plugin.
 *
 * @internal
 */
export function getCompletionItemsAtOffset(
  documentText: string,
  offset: number,
  extensions?: readonly ExtensionDefinition[],
  semanticContext?: FormSpecSerializedCompletionContext | null
): CompletionItem[] {
  if (semanticContext !== null && semanticContext !== undefined) {
    if (semanticContext.kind === "target") {
      return toTargetCompletionItems(
        semanticContext.semantic.tagName,
        semanticContext.semantic.targetCompletions
      );
    }

    if (semanticContext.kind !== "tag-name") {
      return [];
    }

    return filterTagNameCompletionItems(semanticContext.prefix, semanticContext.availableTags);
  }

  const resolvedContext = getSemanticCommentCompletionContextAtOffset(
    documentText,
    offset,
    extensions ? { extensions } : undefined
  );

  if (resolvedContext.kind === "target") {
    return toTargetCompletionItems(
      resolvedContext.semantic.tag.normalizedTagName,
      resolvedContext.semantic.targetCompletions
    );
  }

  if (resolvedContext.kind !== "tag-name") {
    return [];
  }

  return filterTagNameCompletionItems(resolvedContext.prefix, resolvedContext.availableTags);
}
