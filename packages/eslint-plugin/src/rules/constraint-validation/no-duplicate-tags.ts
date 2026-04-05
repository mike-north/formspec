import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { getTagIdentity, scanFormSpecTags } from "../../utils/tag-scanner.js";
import { getTagMetadata } from "../../utils/tag-metadata.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * ESLint rule that reports duplicate FormSpec tags on the same target.
 *
 * @public
 */
export const noDuplicateTags = createRule<[], "duplicateTag" | "duplicateDiscriminatorTag">({
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
      duplicateDiscriminatorTag:
        'Duplicate "@discriminator" tag. Only one discriminator is allowed per declaration.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      const seen = new Set<string>();
      let seenDiscriminator = false;
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (tag.normalizedName === "discriminator") {
          if (seenDiscriminator) {
            context.report({
              loc: tag.comment.loc,
              messageId: "duplicateDiscriminatorTag",
            });
            continue;
          }
          seenDiscriminator = true;
          continue;
        }
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
