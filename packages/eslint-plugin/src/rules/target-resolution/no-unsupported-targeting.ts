import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const noUnsupportedTargeting = createRule<[], "unsupportedTargetingSyntax">({
  name: "target-resolution/no-unsupported-targeting",
  meta: {
    type: "problem",
    docs: {
      description: "Disallows path or member target syntax on tags that do not support it",
    },
    schema: [],
    messages: {
      unsupportedTargetingSyntax:
        'Tag "@{{tag}}" does not support {{targetKind}} targeting syntax.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (!tag.target) continue;
        const metadata = getTagMetadata(tag.rawName);
        if (metadata?.supportedTargets.includes(tag.target.kind)) continue;
        context.report({
          loc: tag.comment.loc,
          messageId: "unsupportedTargetingSyntax",
          data: {
            tag: tag.rawName,
            targetKind: tag.target.kind,
          },
        });
      }
    });
  },
});
