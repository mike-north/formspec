import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor, getDeclarationType, resolveTagTarget } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const validMemberTarget = createRule<[], "unknownMemberTarget">({
  name: "target-resolution/valid-member-target",
  meta: {
    type: "problem",
    docs: {
      description: "Validates member-target references against string literal union fields",
    },
    schema: [],
    messages: {
      unknownMemberTarget: 'Member target ":{{target}}" is not a valid member of this string literal union.',
    },
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    return createDeclarationVisitor((node) => {
      const declarationType = getDeclarationType(node, services);
      if (!declarationType) return;
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (tag.target?.kind !== "member") continue;
        const resolved = resolveTagTarget(tag, declarationType, services);
        if (resolved.reason !== "unknownMember") continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "unknownMemberTarget",
          data: { target: tag.target.value },
        });
      }
    });
  },
});
