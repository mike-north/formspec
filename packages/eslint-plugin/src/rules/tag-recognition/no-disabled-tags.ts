import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { normalizeFormSpecTagName } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

type Options = [{ tags?: string[] }];

/**
 * ESLint rule that reports FormSpec tags disabled by project configuration.
 *
 * @public
 */
export const noDisabledTags = createRule<Options, "disabledTag">({
  name: "tag-recognition/no-disabled-tags",
  meta: {
    type: "problem",
    docs: {
      description: "Reports FormSpec tags disabled by project configuration",
    },
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
      disabledTag: 'Tag "@{{tag}}" is disabled for this project.',
    },
  },
  defaultOptions: [{}],
  create(context) {
    const options = context.options[0] ?? {};
    const disabled = new Set((options.tags ?? []).map(normalizeFormSpecTagName));
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (!disabled.has(tag.normalizedName)) continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "disabledTag",
          data: { tag: tag.rawName },
        });
      }
    });
  },
});
