/**
 * Completion provider for FormSpec JSDoc constraint tags.
 *
 * Uses the shared tag registry from `@formspec/analysis` so completions stay
 * aligned with the same metadata that powers linting and build-time analysis.
 */

import {
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

function toCompletionItem(tag: TagDefinition): CompletionItem {
  return {
    label: `@${tag.canonicalName}`,
    kind: CompletionItemKind.Keyword,
    detail: tag.completionDetail,
  };
}

export function getCompletionItemsAtOffset(
  documentText: string,
  offset: number,
  extensions?: readonly ExtensionDefinition[]
): CompletionItem[] {
  const semanticContext = getSemanticCommentCompletionContextAtOffset(
    documentText,
    offset,
    extensions ? { extensions } : undefined
  );

  if (semanticContext.kind === "target") {
    return semanticContext.semantic.targetCompletions.map((target: string) => ({
      label: target,
      kind:
        target === "singular" || target === "plural"
          ? CompletionItemKind.EnumMember
          : CompletionItemKind.Field,
      detail: `Target for @${semanticContext.semantic.tag.normalizedTagName}`,
    }));
  }

  if (semanticContext.kind !== "tag-name") {
    return [];
  }

  const normalizedPrefix = semanticContext.prefix.toLowerCase();
  return semanticContext.availableTags.map(toCompletionItem).filter((item) =>
    item.label.slice(1).toLowerCase().startsWith(normalizedPrefix)
  );
}
