import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const requireTagArguments = createRule<[], "missingTagArgument">({
  name: "tag-recognition/require-tag-arguments",
  meta: {
    type: "problem",
    docs: {
      description: "Requires arguments for FormSpec tags that need values",
    },
    schema: [],
    messages: {
      missingTagArgument: 'Tag "@{{tag}}" requires an argument.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const metadata = getTagMetadata(tag.rawName);
        if (!metadata?.requiresArgument) continue;
        if (tag.valueText !== "") continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "missingTagArgument",
          data: { tag: tag.rawName },
        });
      }
    });
  },
});
