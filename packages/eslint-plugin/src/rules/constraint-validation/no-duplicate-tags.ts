import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { getTagIdentity, scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

export const noDuplicateTags = createRule<[], "duplicateTag">({
  name: "constraint-validation/no-duplicate-tags",
  meta: {
    type: "problem",
    docs: {
      description: "Reports duplicate FormSpec tags on the same field target",
    },
    schema: [],
    messages: {
      duplicateTag:
        'Duplicate "@{{tag}}" tag. Only the last occurrence is meaningful on the same target.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const seen = new Set<string>();
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        const metadata = getTagMetadata(tag.rawName);
        if (!metadata || metadata.allowDuplicates) continue;
        const identity = getTagIdentity(tag);
        if (seen.has(identity)) {
          context.report({
            loc: tag.comment.loc,
            messageId: "duplicateTag",
            data: { tag: tag.rawName },
          });
          continue;
        }
        seen.add(identity);
      }
    });
  },
});
