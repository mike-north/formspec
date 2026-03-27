import { ESLintUtils } from "@typescript-eslint/utils";
import {
  createDeclarationVisitor,
  getDeclarationType,
  resolveTagTarget,
} from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const validPathTarget = createRule<[], "unknownPathTarget">({
  name: "target-resolution/valid-path-target",
  meta: {
    type: "problem",
    docs: {
      description: "Validates path-target references against the resolved field type",
    },
    schema: [],
    messages: {
      unknownPathTarget: 'Path target ":{{target}}" does not exist on this field type.',
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    return createDeclarationVisitor((node) => {
      const declarationType = getDeclarationType(node, services);
      if (!declarationType) return;
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (tag.target?.kind !== "path") continue;
        const resolved = resolveTagTarget(tag, declarationType, services);
        if (resolved.reason !== "unknownPath") continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "unknownPathTarget",
          data: { target: tag.target.value },
        });
      }
    });
  },
});
