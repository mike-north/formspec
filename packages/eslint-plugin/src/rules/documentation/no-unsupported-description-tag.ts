import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * ESLint rule that bans `@description` usage entirely.
 *
 * @public
 */
export const noUnsupportedDescriptionTag = createRule<[], "descriptionTagForbidden">({
  name: "documentation/no-unsupported-description-tag",
  meta: {
    type: "problem",
    docs: {
      description: "Bans @description, which is not a standard TSDoc tag",
    },
    schema: [],
    messages: {
      descriptionTagForbidden:
        '"@description" is not a standard TSDoc tag and is not supported. Move the description text before the first tag as summary text.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const tags = scanFormSpecTags(node, context.sourceCode);
      const description = tags.find((tag) => tag.normalizedName === "description");
      if (!description) return;
      context.report({
        loc: description.comment.loc,
        messageId: "descriptionTagForbidden",
      });
    });
  },
});
