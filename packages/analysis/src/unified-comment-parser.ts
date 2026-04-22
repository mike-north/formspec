/**
 * Unified comment parser that combines TSDoc structural parsing with span
 * enrichment from the regex-based comment-syntax parser.
 *
 * TSDoc handles structured extraction (summary, remarks, deprecated) while
 * the regex parser provides accurate source spans for IDE tooling. The two
 * are aligned by matching normalized tag names in document order.
 */

import { type DocBlock, type DocComment } from "@microsoft/tsdoc";
import { getOrCreateTSDocParser, TAGS_REQUIRING_RAW_TEXT } from "./tsdoc-config.js";
import {
  extractPlainText,
  extractBlockText,
  choosePreferredPayloadText,
} from "./tsdoc-text-extraction.js";
import {
  parseCommentBlock,
  type ParsedCommentTag,
  type ParsedCommentBlock,
} from "./comment-syntax.js";
import { extractCommentSummaryText } from "./comment-syntax.js";
import { normalizeFormSpecTagName, type ExtensionTagSource } from "./tag-registry.js";

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/**
 * Options for the unified comment parser.
 *
 * @public
 */
export interface UnifiedParseOptions {
  /** Absolute source offset for all emitted spans. */
  readonly offset?: number;
  /** Extension tag sources used to classify target specifiers. */
  readonly extensions?: readonly ExtensionTagSource[];
  /** Additional tag names to register with the TSDoc parser. */
  readonly extensionTagNames?: readonly string[];
}

/**
 * A parsed tag that combines regex-derived span information with TSDoc
 * structural enrichment for the same tag.
 *
 * @public
 */
export interface UnifiedParsedTag extends ParsedCommentTag {
  /** Best-effort resolved payload text (prefers raw span for TAGS_REQUIRING_RAW_TEXT). */
  readonly resolvedPayloadText: string;
}

/**
 * Result of a unified parse, containing all structural fields extracted from
 * the comment along with fully-spanned tag information.
 *
 * @public
 */
export interface UnifiedParsedComment {
  /** Original comment text passed to the parser. */
  readonly commentText: string;
  /** Absolute source offset used for span calculations. */
  readonly offset: number;
  /** Parsed tags with spans and optional TSDoc block references. */
  readonly tags: readonly UnifiedParsedTag[];
  /** Summary text (text before the first block tag). */
  readonly summaryText: string;
  /** Content of the `@remarks` block, or empty string if absent. */
  readonly remarksText: string;
  /** Whether the comment contains a `@deprecated` block. */
  readonly isDeprecated: boolean;
  /** Deprecation message from `@deprecated`, or empty string if not deprecated. */
  readonly deprecationMessage: string;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Parses a JSDoc/TSDoc comment string into a structured representation that
 * combines TSDoc's structural parsing with the regex parser's accurate spans.
 *
 * The parse has four phases:
 * 1. TSDoc structural parse — extracts summary, remarks, deprecated, and
 *    custom block nodes.
 * 2. Regex span parse — extracts tag source spans for IDE tooling use.
 * 3. Tag alignment — matches TSDoc blocks to regex tags by normalized name.
 * 4. Summary extraction — applies the tag-only leakage fix for unregistered
 *    tags that TSDoc folds into the summary section.
 *
 * @public
 */
export function parseUnifiedComment(
  commentText: string,
  options?: UnifiedParseOptions
): UnifiedParsedComment {
  const baseOffset = options?.offset ?? 0;

  // Phase 1: TSDoc structural parse
  const parser = getOrCreateTSDocParser(options?.extensionTagNames ?? []);
  const parserContext = parser.parseString(commentText);
  const docComment = parserContext.docComment;

  // Phase 2: Span enrichment via existing regex parser
  const parsed = parseCommentBlock(
    commentText,
    options?.extensions !== undefined
      ? { offset: baseOffset, extensions: options.extensions }
      : { offset: baseOffset }
  );

  // Phase 3: Align TSDoc blocks with regex-parsed tags
  const tags = alignTagsWithBlocks(parsed, docComment, commentText, baseOffset);

  // Phase 4: Extract structural content from TSDoc
  const summaryText = extractSummaryText(docComment, commentText, parsed);
  const remarksText =
    docComment.remarksBlock !== undefined ? extractBlockText(docComment.remarksBlock).trim() : "";
  const deprecatedBlock = docComment.deprecatedBlock;
  const isDeprecated = deprecatedBlock !== undefined;
  const deprecationMessage =
    deprecatedBlock !== undefined ? extractBlockText(deprecatedBlock).trim() : "";

  return {
    commentText,
    offset: baseOffset,
    tags,
    summaryText,
    remarksText,
    isDeprecated,
    deprecationMessage,
  };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Aligns TSDoc custom blocks with regex-parsed tags by walking both sequences
 * in document order, matching on normalized tag names.
 *
 * Uses a forward cursor over the TSDoc blocks. In the common case (all tags
 * are registered and appear in the same order as their blocks), this is
 * effectively linear. In the worst case (many unregistered regex tags that
 * never match a block) it degrades to O(tags × blocks), which is acceptable
 * given that most real comments have fewer than ~20 tags.
 */
function alignTagsWithBlocks(
  parsed: ParsedCommentBlock,
  docComment: DocComment,
  commentText: string,
  baseOffset: number
): readonly UnifiedParsedTag[] {
  const blocks = [...docComment.customBlocks];
  let blockCursor = 0;

  return parsed.tags.map((tag) => {
    // Walk forward through remaining TSDoc blocks looking for a name match.
    let matchedBlock: DocBlock | null = null;
    for (let i = blockCursor; i < blocks.length; i++) {
      const block = blocks[i];
      if (block === undefined) continue;

      // TSDoc tag names include the leading '@'; strip it before normalizing.
      const blockTagName = normalizeFormSpecTagName(block.blockTag.tagName.substring(1));
      if (blockTagName === tag.normalizedTagName) {
        matchedBlock = block;
        blockCursor = i + 1;
        break;
      }
    }

    const resolvedPayloadText = getResolvedPayloadText(tag, matchedBlock, commentText, baseOffset);

    return {
      ...tag,
      resolvedPayloadText,
    };
  });
}

/**
 * Determines the best resolved payload text for a tag.
 *
 * For tags in TAGS_REQUIRING_RAW_TEXT (e.g. `@pattern`, `@enumOptions`), the
 * span-based extraction is always preferred because TSDoc may mangle `@` or
 * `{}` characters inside the payload.
 *
 * For other tags, choosePreferredPayloadText picks the longer/richer source.
 */
function getResolvedPayloadText(
  tag: ParsedCommentTag,
  docBlock: DocBlock | null,
  commentText: string,
  baseOffset: number
): string {
  const rawText =
    tag.payloadSpan !== null
      ? commentText
          .slice(tag.payloadSpan.start - baseOffset, tag.payloadSpan.end - baseOffset)
          .trim()
      : "";

  // Always use span-based text for tags whose content may contain characters
  // that TSDoc would mangle (regex patterns, JSON objects/arrays).
  if (TAGS_REQUIRING_RAW_TEXT.has(tag.normalizedTagName)) {
    return rawText;
  }

  if (docBlock !== null) {
    const tsdocText = extractBlockText(docBlock).replace(/\s+/g, " ").trim();
    return choosePreferredPayloadText(rawText, tsdocText);
  }

  return rawText;
}

/**
 * Extracts the summary text, applying the tag-only leakage fix.
 *
 * TSDoc folds unregistered or unknown tags into the summary section when those
 * tags are the only content. In that case the TSDoc summary is non-empty but
 * the regex parser (which sees no summary before the first tag) produces an
 * empty string. We detect this mismatch and return empty to stay consistent
 * with the regex parser's view.
 */
function extractSummaryText(
  docComment: DocComment,
  commentText: string,
  parsed: ParsedCommentBlock
): string {
  const summary = extractPlainText(docComment.summarySection).trim();
  const sharedSummary = extractCommentSummaryText(commentText);

  // TSDoc leaves unknown/custom modifier tags in the summary text when
  // they are not registered with the parser. Fall back to the raw comment
  // projection to detect the "tag-only, no summary" case.
  const hasTagOnlySummary = summary !== "" && sharedSummary === "" && parsed.tags.length > 0;
  return hasTagOnlySummary ? "" : summary;
}
