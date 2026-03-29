import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * ESLint rule that validates `@pattern` tag values as regular expressions.
 *
 * @public
 */
export const validRegexPattern = createRule<[], "invalidRegexPattern">({
  name: "value-parsing/valid-regex-pattern",
  meta: {
    type: "problem",
    docs: {
      description: "Validates @pattern tag values as regular expressions",
    },
    schema: [],
    messages: {
      invalidRegexPattern: 'Tag "@pattern" must contain a valid regular expression.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (tag.normalizedName !== "pattern" || tag.valueText === "") continue;
        try {
          new RegExp(tag.valueText);
        } catch {
          context.report({
            loc: tag.comment.loc,
            messageId: "invalidRegexPattern",
          });
        }
      }
    });
  },
});
