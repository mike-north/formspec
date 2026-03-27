import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const noUnknownTags = createRule<[], "unknownTag">({
  name: "tag-recognition/no-unknown-tags",
  meta: {
    type: "problem",
    docs: {
      description: "Reports FormSpec tags that are not part of the specification",
    },
    schema: [],
    messages: {
      unknownTag: 'Unknown FormSpec tag "@{{tag}}".',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (getTagMetadata(tag.rawName) !== null) continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "unknownTag",
          data: { tag: tag.rawName },
        });
      }
    });
  },
});
