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
} from "@formspec/analysis";
import type { ExtensionDefinition } from "@formspec/core";
import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node.js";

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

/** @internal */
export function getCompletionItemsAtOffset(
  documentText: string,
  offset: number,
  extensions?: readonly ExtensionDefinition[],
  semanticContext?: FormSpecSerializedCompletionContext | null
): CompletionItem[] {
  if (semanticContext !== null && semanticContext !== undefined) {
    if (semanticContext.kind === "target") {
      return semanticContext.semantic.targetCompletions.map((target: string) => ({
        label: target,
        kind:
          target === "singular" || target === "plural"
            ? CompletionItemKind.EnumMember
            : CompletionItemKind.Field,
        detail: `Target for @${semanticContext.semantic.tagName}`,
      }));
    }

    if (semanticContext.kind !== "tag-name") {
      return [];
    }

    const normalizedPrefix = semanticContext.prefix.toLowerCase();
    return semanticContext.availableTags
      .map(toCompletionItem)
      .filter((item) => item.label.slice(1).toLowerCase().startsWith(normalizedPrefix));
  }

  const resolvedContext = getSemanticCommentCompletionContextAtOffset(
    documentText,
    offset,
    extensions ? { extensions } : undefined
  );

  if (resolvedContext.kind === "target") {
    return resolvedContext.semantic.targetCompletions.map((target: string) => ({
      label: target,
      kind:
        target === "singular" || target === "plural"
          ? CompletionItemKind.EnumMember
          : CompletionItemKind.Field,
      detail: `Target for @${resolvedContext.semantic.tag.normalizedTagName}`,
    }));
  }

  if (resolvedContext.kind !== "tag-name") {
    return [];
  }

  const normalizedPrefix = resolvedContext.prefix.toLowerCase();
  return resolvedContext.availableTags
    .map(toCompletionItem)
    .filter((item) => item.label.slice(1).toLowerCase().startsWith(normalizedPrefix));
}
