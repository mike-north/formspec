import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { normalizeFormSpecTagName } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * Rule options accepted by `noMarkdownFormatting`.
 *
 * @public
 */
export type Options = [{ tags?: string[] }];

/**
 * Message identifiers emitted by `noMarkdownFormatting`.
 *
 * @public
 */
export type MessageIds = "markdownFormattingForbidden" | "removeAmbiguousMarkdownFormatting";

/**
 * Strips Markdown constructs whose interpretation is unambiguous — stripping
 * them can't plausibly destroy the author's intended meaning. These are
 * eligible for an auto-applied `--fix`.
 *
 * Single-asterisk italics and block-level markers (headings, blockquotes,
 * list markers) are deliberately excluded: they collide with common
 * non-Markdown prose (multiplication like `5 * 3`, leading `- `/`N. ` used
 * as plain punctuation) and are handled by {@link stripAmbiguousMarkdown}
 * as suggestions instead.
 */
function stripDefiniteMarkdown(value: string): string {
  let result = value;

  for (;;) {
    const next = result
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/(^|[^\w\\])_([^_\n]+)_(?!_)/g, "$1$2");

    if (next === result) {
      return next;
    }
    result = next;
  }
}

/**
 * Strips Markdown constructs whose interpretation is ambiguous — stripping
 * them risks losing meaning, so callers must offer these only as ESLint
 * *suggestions*, never as an auto-applied fix.
 *
 * - Single-asterisk italics (`*text*`) collide with multiplication notation.
 *   The flanking check (no whitespace touching the delimiters) additionally
 *   ensures whitespace-padded `*` (e.g. `5 * 3 * 2`) never matches at all,
 *   per CommonMark's emphasis flanking rules.
 * - Block-level markers (headings, blockquotes, list markers) only apply
 *   when the value spans multiple lines — a single-line value that merely
 *   starts with `#`, `>`, `- `, or `N. ` is far more likely to be prose
 *   (e.g. `"- 5 to 5"`, `"1. reason"`) than an actual Markdown block.
 */
function stripAmbiguousMarkdown(value: string): string {
  let result = value;
  const isMultiline = value.includes("\n");

  for (;;) {
    let next = result.replace(/(^|[^\w\\])\*(?!\s)([^*\n]+)(?<!\s)\*(?!\*)/g, "$1$2");

    if (isMultiline) {
      next = next
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, "");
    }

    if (next === result) {
      return next;
    }
    result = next;
  }
}

/**
 * ESLint rule that forbids Markdown formatting in configured FormSpec tag values.
 *
 * @public
 */
export const noMarkdownFormatting = createRule<Options, MessageIds>({
  name: "tag-recognition/no-markdown-formatting",
  meta: {
    type: "suggestion",
    docs: {
      description: "Forbids Markdown formatting in configured FormSpec tag values",
    },
    fixable: "code",
    hasSuggestions: true,
    schema: [
      {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      markdownFormattingForbidden:
        'Tag "@{{tag}}" contains Markdown formatting, which is forbidden for this tag.',
      removeAmbiguousMarkdownFormatting:
        'Remove Markdown-like formatting from tag "@{{tag}}" (this transform is ambiguous and may change the meaning of the text).',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const [options] = context.options as readonly ({ tags?: string[] } | undefined)[];
    const configuredTags = new Set(
      (options?.tags ?? []).map((tagName) => normalizeFormSpecTagName(tagName))
    );

    if (configuredTags.size === 0) {
      return {};
    }

    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (!configuredTags.has(tag.normalizedName)) {
          continue;
        }

        const definiteValue = stripDefiniteMarkdown(tag.valueText);
        const fullValue = stripAmbiguousMarkdown(definiteValue);

        const hasDefiniteChange = definiteValue !== tag.valueText;
        const hasAmbiguousChange = fullValue !== definiteValue;

        if (!hasDefiniteChange && !hasAmbiguousChange) {
          continue;
        }

        const buildReplacement = (strippedValue: string): string | null => {
          const range = tag.rawArgumentRange;
          if (range === null) {
            return null;
          }
          const targetPrefix = tag.target === null ? null : `:${tag.target.raw}`;
          return targetPrefix === null
            ? strippedValue
            : strippedValue === ""
              ? targetPrefix
              : `${targetPrefix} ${strippedValue}`;
        };

        context.report({
          loc: (() => {
            const range = tag.rawArgumentRange;
            if (range === null) {
              return tag.comment.loc;
            }
            return {
              start: context.sourceCode.getLocFromIndex(range[0]),
              end: context.sourceCode.getLocFromIndex(range[1]),
            };
          })(),
          messageId: "markdownFormattingForbidden",
          data: { tag: tag.rawName },
          // Only the unambiguous transform is auto-applied. Ambiguous
          // constructs (single-asterisk italics, block-level markers) are
          // never auto-fixed — they're offered as a suggestion below.
          fix: hasDefiniteChange
            ? (fixer) => {
                const range = tag.rawArgumentRange;
                const replacement = buildReplacement(definiteValue);
                if (range === null || replacement === null) {
                  return null;
                }
                return fixer.replaceTextRange(range, replacement);
              }
            : null,
          suggest: hasAmbiguousChange
            ? [
                {
                  messageId: "removeAmbiguousMarkdownFormatting",
                  data: { tag: tag.rawName },
                  fix: (fixer) => {
                    const range = tag.rawArgumentRange;
                    const replacement = buildReplacement(fullValue);
                    if (range === null || replacement === null) {
                      return null;
                    }
                    return fixer.replaceTextRange(range, replacement);
                  },
                },
              ]
            : [],
        });
      }
    });
  },
});
