import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * ESLint rule that validates numeric-valued FormSpec tags.
 *
 * @public
 */
export const validNumericValue = createRule<[], "invalidNumericValue">({
  name: "value-parsing/valid-numeric-value",
  meta: {
    type: "problem",
    docs: {
      description: "Validates numeric-valued FormSpec tags",
    },
    schema: [],
    messages: {
      invalidNumericValue: 'Tag "@{{tag}}" requires a valid numeric value.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const metadata = getTagMetadata(tag.rawName);
        if (metadata?.valueKind !== "number") continue;
        if (tag.valueText === "") continue;
        const value = Number(tag.valueText);
        if (Number.isFinite(value)) continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "invalidNumericValue",
          data: { tag: tag.rawName },
        });
      }
    });
  },
});
