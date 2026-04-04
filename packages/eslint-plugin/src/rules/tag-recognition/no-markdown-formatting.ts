import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { normalizeFormSpecTagName } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

function stripMarkdownFormatting(value: string): string {
  let result = value;

  for (;;) {
    const next = result
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/(^|[^\w\\])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/(^|[^\w\\])_([^_\n]+)_(?!_)/g, "$1$2")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, "");

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
export const noMarkdownFormatting = createRule<
  [{ tags?: string[] }],
  "markdownFormattingForbidden"
>({
  name: "tag-recognition/no-markdown-formatting",
  meta: {
    type: "suggestion",
    docs: {
      description: "Forbids Markdown formatting in configured FormSpec tag values",
    },
    fixable: "code",
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

        const strippedValue = stripMarkdownFormatting(tag.valueText);
        if (strippedValue === tag.valueText) {
          continue;
        }

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
          fix:
            tag.rawArgumentRange === null
              ? null
              : (fixer) => {
                  const range = tag.rawArgumentRange;
                  if (range === null) {
                    return null;
                  }
                  const targetPrefix = tag.target === null ? null : `:${tag.target.raw}`;
                  const replacement =
                    targetPrefix === null
                      ? strippedValue
                      : strippedValue === ""
                        ? targetPrefix
                        : `${targetPrefix} ${strippedValue}`;
                  return fixer.replaceTextRange(range, replacement);
                },
        });
      }
    });
  },
});
