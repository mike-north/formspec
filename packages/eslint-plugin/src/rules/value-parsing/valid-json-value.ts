import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const validJsonValue = createRule<[], "invalidJsonValue">({
  name: "value-parsing/valid-json-value",
  meta: {
    type: "problem",
    docs: {
      description: "Validates JSON-valued FormSpec tags",
    },
    schema: [],
    messages: {
      invalidJsonValue: 'Tag "@{{tag}}" requires valid JSON.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const metadata = getTagMetadata(tag.rawName);
        if (metadata?.valueKind !== "json") continue;
        if (tag.valueText === "") continue;
        try {
          JSON.parse(tag.valueText);
        } catch {
          context.report({
            loc: tag.comment.loc,
            messageId: "invalidJsonValue",
            data: { tag: tag.rawName },
          });
        }
      }
    });
  },
});
