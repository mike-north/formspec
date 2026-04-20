import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags, getLeadingJSDocComments } from "../../utils/tag-scanner.js";
import { readExtensionTagNames } from "../../utils/tag-metadata.js";
import { TAGS_REQUIRING_RAW_TEXT, getOrCreateTSDocParser } from "@formspec/analysis/internal";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://formspec.dev/eslint-plugin/rules/${name}`
);

/**
 * ESLint rule that validates TSDoc comment syntax using FormSpec's TSDoc
 * configuration, suppressing false positives on raw-text FormSpec tag payloads
 * such as `@pattern` regex values and `@enumOptions`/`@defaultValue` JSON values.
 *
 * Intended as a drop-in replacement for `tsdoc/syntax` from `eslint-plugin-tsdoc`
 * in projects that use FormSpec constraint tags.
 *
 * @public
 */
export const tsdocCommentSyntax = createRule<[], "tsdocSyntax">({
  name: "tag-recognition/tsdoc-comment-syntax",
  meta: {
    type: "problem",
    docs: {
      description:
        "Validates TSDoc comment syntax, suppressing false positives on FormSpec raw-text tag payloads",
    },
    schema: [],
    messages: {
      tsdocSyntax: "{{message}} (tsdoc {{code}})",
    },
  },
  defaultOptions: [],
  create(context) {
    // Thread extension-defined constraint, metadata, and annotation tag names
    // through to the TSDoc parser so custom project tags registered via
    // `withConfig()` aren't reported as unknown.
    const extensionTagNames = readExtensionTagNames(context.settings);
    const parser = getOrCreateTSDocParser(extensionTagNames);

    return createDeclarationVisitor((node) => {
      // Collect raw-text payload ranges for tags that allow TSDoc-significant
      // characters ({}, @) in their payloads. Diagnostics whose absolute source
      // range overlaps any of these ranges are suppressed to avoid false positives.
      const rawTextRanges: (readonly [number, number])[] = [];
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (TAGS_REQUIRING_RAW_TEXT.has(tag.normalizedName) && tag.rawArgumentRange !== null) {
          rawTextRanges.push(tag.rawArgumentRange);
        }
      }

      for (const comment of getLeadingJSDocComments(node, context.sourceCode)) {
        // Reconstruct the full `/** ... */` comment text as it appears in source.
        // `getLeadingJSDocComments` only returns Block comments whose value starts
        // with `*`, so wrapping with `/*` / `*/` yields the exact original text.
        const commentText = `/*${comment.value}*/`;
        const commentStart = comment.range[0];

        const parserContext = parser.parseString(commentText);

        for (const msg of parserContext.log.messages) {
          // Convert comment-local offsets to absolute source-file offsets.
          const absPos = commentStart + msg.textRange.pos;
          const absEnd = commentStart + msg.textRange.end;

          // Half-open overlap check with raw-text payload ranges [start, end).
          const suppressed = rawTextRanges.some(
            ([rangeStart, rangeEnd]) => absPos < rangeEnd && absEnd > rangeStart
          );
          if (suppressed) continue;

          context.report({
            loc: {
              start: context.sourceCode.getLocFromIndex(absPos),
              end: context.sourceCode.getLocFromIndex(absEnd),
            },
            messageId: "tsdocSyntax",
            data: {
              message: msg.unformattedText,
              code: msg.messageId,
            },
          });
        }
      }
    });
  },
});
