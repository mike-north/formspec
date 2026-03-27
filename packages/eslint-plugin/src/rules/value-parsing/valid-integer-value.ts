import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const validIntegerValue = createRule<[], "invalidIntegerValue">({
  name: "value-parsing/valid-integer-value",
  meta: {
    type: "problem",
    docs: {
      description: "Validates integer-valued FormSpec tags",
    },
    schema: [],
    messages: {
      invalidIntegerValue: 'Tag "@{{tag}}" requires an integer value.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const metadata = getTagMetadata(tag.rawName);
        if (metadata?.valueKind !== "integer" && metadata?.valueKind !== "signedInteger") continue;
        if (tag.valueText === "") continue;
        const value = Number(tag.valueText);
        if (
          Number.isInteger(value) &&
          (metadata.valueKind === "signedInteger" || value >= 0)
        ) {
          continue;
        }
        context.report({
          loc: tag.comment.loc,
          messageId: "invalidIntegerValue",
          data: { tag: tag.rawName },
        });
      }
    });
  },
});
