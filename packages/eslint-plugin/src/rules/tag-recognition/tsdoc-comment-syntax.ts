import { ESLintUtils } from "@typescript-eslint/utils";
import { createDeclarationVisitor } from "../../utils/rule-helpers.js";
import { scanFormSpecTags, getLeadingJSDocComments } from "../../utils/tag-scanner.js";
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
    // TODO: thread extension tag names from settings.formspec.extensionRegistry
    // when the ExtensionRegistry interface exposes a method to enumerate extension
    // constraint tag names. For now, only the built-in FormSpec tags are registered.
    const parser = getOrCreateTSDocParser([]);

    return createDeclarationVisitor((node) => {
      // Collect raw-text payload ranges for tags that allow TSDoc-significant
      // characters ({}, @) in their payloads. Diagnostics whose absolute source
      // range overlaps any of these ranges are suppressed to avoid false positives.
      const rawTextRanges: (readonly [start: number, end: number])[] = [];
      for (const tag of scanFormSpecTags(node, context.sourceCode)) {
        if (TAGS_REQUIRING_RAW_TEXT.has(tag.normalizedName) && tag.rawArgumentRange !== null) {
          rawTextRanges.push(tag.rawArgumentRange);
        }
      }

      for (const comment of getLeadingJSDocComments(node, context.sourceCode)) {
        // Reconstruct the full `/** ... */` comment text as it appears in source.
        // comment.value is the inner text (without the surrounding /* and */).
        const commentText = `/*${comment.value}*/`;
        const commentStart = comment.range[0];

        const parserContext = parser.parseString(commentText);

        for (const msg of parserContext.log.messages) {
          const localPos = msg.textRange.pos;
          const localEnd = msg.textRange.end;

          // Convert comment-local offsets to absolute source-file offsets.
          const absPos = commentStart + localPos;
          const absEnd = commentStart + localEnd;

          // Suppress diagnostics whose source range overlaps a raw-text payload range.
          const suppressed = rawTextRanges.some(
            ([rangeStart, rangeEnd]) => !(absEnd <= rangeStart || absPos >= rangeEnd)
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
