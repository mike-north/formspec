import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const noDescriptionConflict = createRule<[], "descriptionRemarksConflict">({
  name: "constraint-validation/no-description-conflict",
  meta: {
    type: "problem",
    docs: {
      description: "Reports conflicting @description and @remarks tags on the same field",
    },
    schema: [],
    messages: {
      descriptionRemarksConflict:
        'Both "@description" and "@remarks" are present. "@description" takes precedence.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const tags = scanFormSpecTags(node, context.sourceCode);
      const description = tags.find((tag) => tag.normalizedName === "description");
      const remarks = tags.find((tag) => tag.normalizedName === "remarks");
      if (!description || !remarks) return;
      context.report({
        loc: remarks.comment.loc,
        messageId: "descriptionRemarksConflict",
      });
    });
  },
});
