/**
 * Completion provider for FormSpec JSDoc constraint tags.
 *
 * Uses the shared tag registry from `@formspec/analysis` so completions stay
 * aligned with the same metadata that powers linting and build-time analysis.
 */

import {
  getCommentCompletionContextAtOffset,
  getConstraintTagDefinitions,
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

export function getCompletionItemsAtOffset(
  documentText: string,
  offset: number,
  extensions?: readonly ExtensionDefinition[]
): CompletionItem[] {
  const context = getCommentCompletionContextAtOffset(
    documentText,
    offset,
    extensions ? { extensions } : undefined
  );
  if (context.kind !== "tag-name") {
    return [];
  }

  const normalizedPrefix = context.prefix.toLowerCase();
  return getCompletionItems(extensions).filter((item) =>
    item.label.slice(1).toLowerCase().startsWith(normalizedPrefix)
  );
}
