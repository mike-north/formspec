/**
 * Completion provider for FormSpec JSDoc constraint tags.
 *
 * Returns completion items for all recognized FormSpec JSDoc constraint tags
 * (e.g., `@minimum`, `@maximum`, `@pattern`), derived from
 * `BUILTIN_CONSTRAINT_DEFINITIONS`. This is a skeleton — context-aware
 * filtering will be added in a future phase.
 */

import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  type BuiltinConstraintName,
  type ExtensionDefinition,
} from "@formspec/core";
import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node.js";

/**
 * Human-readable detail strings for each built-in constraint tag.
 *
 * Keys match the camelCase constraint names (matching keys in `BUILTIN_CONSTRAINT_DEFINITIONS`).
 * Values are shown as the detail string in completion items.
 */
const CONSTRAINT_DETAIL: Record<BuiltinConstraintName, string> = {
  minimum: "Minimum numeric value (inclusive). Example: `@minimum 0`",
  maximum: "Maximum numeric value (inclusive). Example: `@maximum 100`",
  exclusiveMinimum: "Minimum numeric value (exclusive). Example: `@exclusiveMinimum 0`",
  exclusiveMaximum: "Maximum numeric value (exclusive). Example: `@exclusiveMaximum 100`",
  multipleOf: "Value must be a multiple of this number. Example: `@multipleOf 0.01`",
  minLength: "Minimum string length. Example: `@minLength 1`",
  maxLength: "Maximum string length. Example: `@maxLength 255`",
  minItems: "Minimum number of array items. Example: `@minItems 1`",
  maxItems: "Maximum number of array items. Example: `@maxItems 10`",
  uniqueItems: "Require all array items to be distinct. Example: `@uniqueItems`",
  pattern: "Regular expression pattern for string validation. Example: `@pattern ^[a-z]+$`",
  enumOptions: 'Inline JSON array of allowed enum values. Example: `@enumOptions ["a","b","c"]`',
  const: 'Require a constant JSON value. Example: `@const "USD"`',
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
export function getCompletionItems(extensions?: readonly ExtensionDefinition[]): CompletionItem[] {
  const builtins = (Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS) as BuiltinConstraintName[]).map(
    (name) => ({
      label: `@${name}`,
      kind: CompletionItemKind.Keyword,
      detail: CONSTRAINT_DETAIL[name],
    })
  );

  const customItems =
    extensions?.flatMap((extension) =>
      (extension.constraintTags ?? []).map((tag) => ({
        label: `@${tag.tagName}`,
        kind: CompletionItemKind.Keyword,
        detail: `Extension constraint tag from ${extension.extensionId}`,
      }))
    ) ?? [];

  return [...builtins, ...customItems];
}
