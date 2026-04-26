import { ESLintUtils } from "@typescript-eslint/utils";
import { extractCommentSummaryText, parseCommentBlock } from "@formspec/analysis/internal";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { getLeadingJSDocComments } from "../../utils/tag-scanner.js";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * ESLint rule that warns when `@remarks` has no author-facing summary text.
 *
 * @public
 */
export const remarksWithoutSummary = createRule<[], "remarksWithoutSummary">({
  name: "documentation/remarks-without-summary",
  meta: {
    type: "suggestion",
    docs: {
      description: "Warns when @remarks appears without summary text",
    },
    schema: [],
    messages: {
      remarksWithoutSummary:
        '"@remarks" is present but no summary text was found. Add summary text before the first tag so that JSON Schema "description", VS Code tooltips, and Dashboard form help text are populated.',
    },
  },
  defaultOptions: [],
  create(context) {
    return createDeclarationVisitor((node) => {
      for (const comment of getLeadingJSDocComments(node, context.sourceCode)) {
        const commentText = `/*${comment.value}*/`;
        const parsed = parseCommentBlock(commentText, { offset: comment.range[0] });
        const remarks = parsed.tags.find((tag) => tag.normalizedTagName === "remarks");
        if (!remarks) continue;

        // Summary text is the only source for JSON Schema `description`; an
        // otherwise tag-only comment with @remarks needs an author-visible hint.
        if (extractCommentSummaryText(commentText).trim() !== "") continue;

        context.report({
          loc: {
            start: context.sourceCode.getLocFromIndex(remarks.tagNameSpan.start),
            end: context.sourceCode.getLocFromIndex(remarks.tagNameSpan.end),
          },
          messageId: "remarksWithoutSummary",
        });
      }
    });
  },
});
