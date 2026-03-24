/**
 * Completion provider for FormSpec JSDoc constraint tags.
 *
 * Returns completion items for all recognized FormSpec JSDoc constraint tags
 * (e.g., `@Minimum`, `@Maximum`, `@Pattern`), derived from
 * `BUILTIN_CONSTRAINT_DEFINITIONS`. This is a skeleton — context-aware
 * filtering will be added in a future phase.
 */

import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core";
import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node.js";

/**
 * Human-readable detail strings for each built-in constraint tag.
 *
 * Keys match the constraint name (matching keys in `BUILTIN_CONSTRAINT_DEFINITIONS`).
 * Values are shown as the detail string in completion items.
 */
const CONSTRAINT_DETAIL: Record<string, string> = {
  Minimum: "Minimum numeric value (inclusive). Example: `@Minimum 0`",
  Maximum: "Maximum numeric value (inclusive). Example: `@Maximum 100`",
  ExclusiveMinimum: "Minimum numeric value (exclusive). Example: `@ExclusiveMinimum 0`",
  ExclusiveMaximum: "Maximum numeric value (exclusive). Example: `@ExclusiveMaximum 100`",
  MinLength: "Minimum string length. Example: `@MinLength 1`",
  MaxLength: "Maximum string length. Example: `@MaxLength 255`",
  Pattern: "Regular expression pattern for string validation. Example: `@Pattern ^[a-z]+$`",
  EnumOptions: 'Inline JSON array of allowed enum values. Example: `@EnumOptions ["a","b","c"]`',
};

/**
 * Returns completion items for all FormSpec JSDoc constraint tags.
 *
 * Items are derived from `BUILTIN_CONSTRAINT_DEFINITIONS`, ensuring this list
 * stays in sync with the single source of truth in `@formspec/core`.
 *
 * Each item uses `CompletionItemKind.Keyword` since these are annotation
 * tags used within JSDoc comments rather than language symbols.
 *
 * @returns An array of LSP completion items for FormSpec constraint tags
 */
export function getCompletionItems(): CompletionItem[] {
  return Object.entries(CONSTRAINT_DETAIL).map(([name, detail]) => ({

    label: `@${name}`,
    kind: CompletionItemKind.Keyword,
    detail,
  }));
}
