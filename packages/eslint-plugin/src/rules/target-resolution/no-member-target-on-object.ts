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

/**
 * ESLint rule that disallows member-target syntax on non-union object fields.
 *
 * @public
 */
export const noMemberTargetOnObject = createRule<[], "memberTargetOnNonUnion">({
  name: "target-resolution/no-member-target-on-object",
  meta: {
    type: "problem",
    docs: {
      description: "Disallows member-target syntax on non-string-literal-union fields",
    },
    schema: [],
    messages: {
      memberTargetOnNonUnion:
        'Member-target syntax ":{{target}}" is only valid on string literal union fields.',
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
        if (resolved.reason !== "memberTargetOnNonUnion") continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "memberTargetOnNonUnion",
          data: { target: tag.target.value },
        });
      }
    });
  },
});
