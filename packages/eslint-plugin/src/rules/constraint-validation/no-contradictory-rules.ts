import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const noContradictoryRules = createRule<[], "contradictoryRuleEffects">({
  name: "constraint-validation/no-contradictory-rules",
  meta: {
    type: "problem",
    docs: {
      description: "Reports contradictory FormSpec conditional rule effects on the same field",
    },
    schema: [],
    messages: {
      contradictoryRuleEffects:
        'Contradictory rule effects: "@{{tagA}}" and "@{{tagB}}" cannot both apply to the same field.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const tags = scanFormSpecTags(node, context.sourceCode);
      const showWhen = tags.find((tag) => tag.normalizedName === "showWhen");
      const hideWhen = tags.find((tag) => tag.normalizedName === "hideWhen");
      if (showWhen && hideWhen) {
        context.report({
          loc: hideWhen.comment.loc,
          messageId: "contradictoryRuleEffects",
          data: { tagA: showWhen.rawName, tagB: hideWhen.rawName },
        });
      }

      const enableWhen = tags.find((tag) => tag.normalizedName === "enableWhen");
      const disableWhen = tags.find((tag) => tag.normalizedName === "disableWhen");
      if (enableWhen && disableWhen) {
        context.report({
          loc: disableWhen.comment.loc,
          messageId: "contradictoryRuleEffects",
          data: { tagA: enableWhen.rawName, tagB: disableWhen.rawName },
        });
      }

      const visibilityTag = showWhen ?? hideWhen;
      const interactivityTag = enableWhen ?? disableWhen;
      if (visibilityTag && interactivityTag) {
        context.report({
          loc: interactivityTag.comment.loc,
          messageId: "contradictoryRuleEffects",
          data: { tagA: visibilityTag.rawName, tagB: interactivityTag.rawName },
        });
      }
    });
  },
});
