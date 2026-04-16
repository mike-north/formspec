/**
 * Tests for parseUnifiedComment.
 *
 * Each test asserts against the specification rather than against program
 * output. Structural sections (summary, remarks, deprecated) are verified
 * against what the original TSDoc comment text dictates.
 */

import { describe, expect, it } from "vitest";
import { parseCommentBlock } from "../comment-syntax.js";
import { parseUnifiedComment } from "../unified-comment-parser.js";

// =============================================================================
// BASIC PARSING
// =============================================================================

describe("parseUnifiedComment — basic parsing", () => {
  it("parses a single tag", () => {
    const comment = "/** @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.normalizedTagName).toBe("minimum");
    expect(result.tags[0]?.argumentText).toBe("0");
  });

  it("parses multiple tags in document order", () => {
    const comment = "/**\n * @minimum 0\n * @maximum 100\n * @minLength 5\n */";
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(3);
    expect(result.tags[0]?.normalizedTagName).toBe("minimum");
    expect(result.tags[1]?.normalizedTagName).toBe("maximum");
    expect(result.tags[2]?.normalizedTagName).toBe("minLength");
  });

  it("returns empty tags array for a comment with no tags", () => {
    const result = parseUnifiedComment("/** No tags here */");

    expect(result.tags).toHaveLength(0);
  });

  it("returns empty tags array for an empty comment", () => {
    const result = parseUnifiedComment("/** */");

    expect(result.tags).toHaveLength(0);
  });

  it("carries commentText and offset through verbatim", () => {
    const comment = "/** @minimum 1 */";
    const result = parseUnifiedComment(comment, { offset: 42 });

    expect(result.commentText).toBe(comment);
    expect(result.offset).toBe(42);
  });

  it("defaults offset to 0 when not provided", () => {
    const result = parseUnifiedComment("/** @minimum 0 */");

    expect(result.offset).toBe(0);
  });
});

// =============================================================================
// SUMMARY EXTRACTION
// =============================================================================

describe("parseUnifiedComment — summary extraction", () => {
  it("extracts description text that appears before the first tag", () => {
    // spec: summary text = content before the first block tag
    const comment = "/** A useful description. @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.summaryText).toBe("A useful description.");
  });

  it("returns empty summaryText when only tags are present (no description)", () => {
    // A comment containing only a registered tag with no prose before it
    // should produce an empty summaryText. TSDoc correctly places @minimum
    // into a custom block, so no leakage into the summary section occurs.
    const comment = "/** @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.summaryText).toBe("");
  });

  it("returns empty summaryText for a completely empty comment", () => {
    const result = parseUnifiedComment("/** */");

    expect(result.summaryText).toBe("");
  });

  it("returns the full description when no tags follow", () => {
    const comment = "/** Just a description with no tags. */";
    const result = parseUnifiedComment(comment);

    expect(result.summaryText).toBe("Just a description with no tags.");
  });

  it("extracts multi-word summary before first tag", () => {
    const comment = "/** The age of the person. @minimum 0 @maximum 150 */";
    const result = parseUnifiedComment(comment);

    expect(result.summaryText).toBe("The age of the person.");
  });

  it("extracts summary from multi-line comment where description is on first line", () => {
    const comment = "/**\n * A field description.\n * @minimum 0\n */";
    const result = parseUnifiedComment(comment);

    expect(result.summaryText).toBe("A field description.");
  });

  it("returns empty summaryText for tag-only with unregistered tag (leakage fix)", () => {
    // @unknowntag is not registered with TSDoc, so TSDoc puts it in the summary.
    // The leakage fix detects that extractCommentSummaryText returns "" and
    // overrides the non-empty TSDoc summary to return "" as well.
    const comment = "/** @unknowntag somevalue */";
    const result = parseUnifiedComment(comment);

    expect(result.summaryText).toBe("");
  });
});

// =============================================================================
// REMARKS EXTRACTION
// =============================================================================

describe("parseUnifiedComment — remarks extraction", () => {
  it("extracts @remarks content", () => {
    const comment = "/** Summary text. @remarks Some additional remarks here. */";
    const result = parseUnifiedComment(comment);

    // spec: remarksText = extractBlockText(remarksBlock).trim()
    expect(result.remarksText).toBe("Some additional remarks here.");
  });

  it("returns empty string when no @remarks block is present", () => {
    const comment = "/** Just a summary. @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.remarksText).toBe("");
  });

  it("extracts multi-line @remarks content", () => {
    const comment = "/**\n * Summary.\n * @remarks Line one.\n * Line two.\n */";
    const result = parseUnifiedComment(comment);

    expect(result.remarksText).toContain("Line one");
    expect(result.remarksText).toContain("Line two");
  });
});

// =============================================================================
// DEPRECATED EXTRACTION
// =============================================================================

describe("parseUnifiedComment — deprecated extraction", () => {
  it("sets isDeprecated true and extracts deprecation message", () => {
    // spec: isDeprecated = deprecatedBlock !== undefined
    // spec: deprecationMessage = extractBlockText(deprecatedBlock).trim()
    const comment = "/** @deprecated Use the new API instead. */";
    const result = parseUnifiedComment(comment);

    expect(result.isDeprecated).toBe(true);
    expect(result.deprecationMessage).toBe("Use the new API instead.");
  });

  it("sets isDeprecated true with empty message when no message follows @deprecated", () => {
    const comment = "/** @deprecated */";
    const result = parseUnifiedComment(comment);

    expect(result.isDeprecated).toBe(true);
    expect(result.deprecationMessage).toBe("");
  });

  it("sets isDeprecated false and deprecationMessage empty when no @deprecated", () => {
    const comment = "/** Regular comment. @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.isDeprecated).toBe(false);
    expect(result.deprecationMessage).toBe("");
  });
});

// =============================================================================
// RAW PAYLOAD FOR TAGS_REQUIRING_RAW_TEXT
// =============================================================================

describe("parseUnifiedComment — resolvedPayloadText for TAGS_REQUIRING_RAW_TEXT", () => {
  it("preserves @ characters in @pattern payload via span-based extraction", () => {
    // spec (TAGS_REQUIRING_RAW_TEXT): always use span-based text for @pattern
    // because regex patterns commonly contain @ (e.g. email validation).
    const comment = "/** @pattern ^[^@]+@[^@]+$ */";
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(1);
    const tag = result.tags[0];
    expect(tag?.normalizedTagName).toBe("pattern");
    // The full regex must be intact — span-based extraction preserves @
    expect(tag?.resolvedPayloadText).toBe("^[^@]+@[^@]+$");
  });

  it("preserves {} characters in @enumOptions payload via span-based extraction", () => {
    // spec (TAGS_REQUIRING_RAW_TEXT): always use span-based text for @enumOptions
    // because JSON arrays may contain object literals with {}.
    const comment = '/** @enumOptions [{"a":1}] */';
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(1);
    const tag = result.tags[0];
    expect(tag?.normalizedTagName).toBe("enumOptions");
    expect(tag?.resolvedPayloadText).toBe('[{"a":1}]');
  });

  it("preserves JSON in @defaultValue payload via span-based extraction", () => {
    // spec (TAGS_REQUIRING_RAW_TEXT): always use span-based text for @defaultValue
    // because JSON defaults may contain objects, arrays, or quoted strings.
    const comment = '/** @defaultValue {"key": "value"} */';
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(1);
    const tag = result.tags[0];
    expect(tag?.normalizedTagName).toBe("defaultValue");
    expect(tag?.resolvedPayloadText).toBe('{"key": "value"}');
  });

  it("uses non-raw extraction for a regular tag like @minimum", () => {
    // @minimum is not in TAGS_REQUIRING_RAW_TEXT — resolvedPayloadText is still set
    // but comes from choosePreferredPayloadText, not forced span-only.
    const comment = "/** @minimum 42 */";
    const result = parseUnifiedComment(comment);

    const tag = result.tags[0];
    expect(tag?.resolvedPayloadText).toBe("42");
  });
});

// =============================================================================
// BLOCK ALIGNMENT (observable via resolvedPayloadText)
// =============================================================================

describe("parseUnifiedComment — block alignment", () => {
  it("resolves payload text for a registered tag", () => {
    // @minimum is registered in FormSpec's TSDoc config, so TSDoc produces a
    // customBlock for it. The resolved payload text should be non-empty.
    const comment = "/** @minimum 5 */";
    const result = parseUnifiedComment(comment);

    expect(result.tags[0]?.resolvedPayloadText).toBe("5");
  });

  it("still resolves payload text for a tag TSDoc does not know (span-based fallback)", () => {
    // @foobar is not registered with TSDoc. The span-based extraction provides
    // the resolved text directly without a TSDoc block.
    const comment = "/** @foobar somevalue */";
    const result = parseUnifiedComment(comment);

    expect(result.tags[0]?.resolvedPayloadText).toBe("somevalue");
  });

  it("resolves correct payload text for multiple registered tags in document order", () => {
    // Both @minimum and @maximum are registered. The resolved text must
    // correspond to the right tag in document order.
    const comment = "/**\n * @minimum 0\n * @maximum 100\n */";
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(2);
    expect(result.tags[0]?.normalizedTagName).toBe("minimum");
    expect(result.tags[0]?.resolvedPayloadText).toBe("0");
    expect(result.tags[1]?.normalizedTagName).toBe("maximum");
    expect(result.tags[1]?.resolvedPayloadText).toBe("100");
  });

  it("resolves payload text for registered tag when an unrecognized tag appears before it", () => {
    // The cursor advances only on successful matches, not on every iteration,
    // so an unrecognized tag must not interfere with payload resolution for
    // the following registered tag.
    const comment = "/** @foobar x @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.tags).toHaveLength(2);
    expect(result.tags[0]?.normalizedTagName).toBe("foobar");
    expect(result.tags[0]?.resolvedPayloadText).toBe("x");
    expect(result.tags[1]?.normalizedTagName).toBe("minimum");
    expect(result.tags[1]?.resolvedPayloadText).toBe("0");
  });
});

// =============================================================================
// TAG SPANS PRESERVED
// =============================================================================

describe("parseUnifiedComment — tag spans preserved", () => {
  it("fullSpan, tagNameSpan, and argumentSpan match parseCommentBlock output exactly", () => {
    // The unified parser must not alter spans produced by the regex parser.
    // spec: spans come entirely from parseCommentBlock; TSDoc does not touch them.
    const comment = "/** @minimum 0 */";
    const unified = parseUnifiedComment(comment);
    const regex = parseCommentBlock(comment);

    expect(unified.tags).toHaveLength(1);
    expect(regex.tags).toHaveLength(1);

    const ut = unified.tags[0];
    const rt = regex.tags[0];

    expect(ut?.fullSpan).toEqual(rt?.fullSpan);
    expect(ut?.tagNameSpan).toEqual(rt?.tagNameSpan);
    expect(ut?.argumentSpan).toEqual(rt?.argumentSpan);
    expect(ut?.payloadSpan).toEqual(rt?.payloadSpan);
  });

  it("shifts spans by the given offset", () => {
    const comment = "/** @minimum 0 */";
    const result = parseUnifiedComment(comment, { offset: 100 });

    const tag = result.tags[0];
    // tagNameSpan.start == 4 (without offset) → 104 with offset 100
    expect(tag?.tagNameSpan.start).toBe(104);
    expect(tag?.tagNameSpan.end).toBe(112);
  });

  it("colonSpan and payloadSpan match parseCommentBlock for a path target", () => {
    const comment = "/** @minimum :amount.value 0 */";
    const unified = parseUnifiedComment(comment);
    const regex = parseCommentBlock(comment);

    const ut = unified.tags[0];
    const rt = regex.tags[0];

    expect(ut?.colonSpan).toEqual(rt?.colonSpan);
    expect(ut?.payloadSpan).toEqual(rt?.payloadSpan);
  });
});

// =============================================================================
// TARGET SPECIFIERS
// =============================================================================

describe("parseUnifiedComment — target specifiers", () => {
  it("preserves path target specifier from regex parser", () => {
    // spec: targets come from parseCommentBlock and are not modified
    const comment = "/** @minimum :amount.value 0 */";
    const result = parseUnifiedComment(comment);

    const tag = result.tags[0];
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.kind).toBe("path");
    expect(tag?.target?.rawText).toBe("amount.value");
    expect(tag?.argumentText).toBe("0");
  });

  it("preserves member target specifier from regex parser", () => {
    const comment = "/** @apiName :singular home */";
    const result = parseUnifiedComment(comment);

    const tag = result.tags[0];
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.kind).toBe("variant");
    expect(tag?.target?.rawText).toBe("singular");
    expect(tag?.argumentText).toBe("home");
  });

  it("preserves null target when no target specifier is present", () => {
    const comment = "/** @minimum 0 */";
    const result = parseUnifiedComment(comment);

    expect(result.tags[0]?.target).toBeNull();
    expect(result.tags[0]?.colonSpan).toBeNull();
  });
});

// =============================================================================
// CONSISTENCY WITH parseCommentBlock
// =============================================================================

describe("parseUnifiedComment — consistency with parseCommentBlock", () => {
  const TEST_COMMENTS = [
    "/** @minimum 0 */",
    "/** @minimum 0 @maximum 100 */",
    "/** Summary text. @minimum 5 @displayName :draft Draft */",
    "/** @pattern ^[^@]+@[^@]+$ */",
    '/** @enumOptions [{"value": "a"}] */',
    "/** A description only, no tags. */",
    "/** */",
    "/**\n * @minimum 0\n * @maximum 100\n * @minLength 5\n */",
    "/** @deprecated Use replacement. @minimum 0 */",
    "/** @minimum :amount.value 0 */",
    "/** @foobar somevalue */",
  ];

  for (const comment of TEST_COMMENTS) {
    it(`tag list matches parseCommentBlock for: ${JSON.stringify(comment)}`, () => {
      const unified = parseUnifiedComment(comment);
      const regex = parseCommentBlock(comment);

      // Same number of tags
      expect(unified.tags).toHaveLength(regex.tags.length);

      // Each tag's identity fields match
      for (let i = 0; i < regex.tags.length; i++) {
        const ut = unified.tags[i];
        const rt = regex.tags[i];

        expect(ut?.normalizedTagName).toBe(rt?.normalizedTagName);
        expect(ut?.rawTagName).toBe(rt?.rawTagName);
        expect(ut?.argumentText).toBe(rt?.argumentText);
        expect(ut?.recognized).toBe(rt?.recognized);

        // Target info preserved verbatim
        expect(ut?.target?.kind).toBe(rt?.target?.kind);
        expect(ut?.target?.rawText).toBe(rt?.target?.rawText);

        // All spans preserved verbatim
        expect(ut?.fullSpan).toEqual(rt?.fullSpan);
        expect(ut?.tagNameSpan).toEqual(rt?.tagNameSpan);
        expect(ut?.argumentSpan).toEqual(rt?.argumentSpan);
        expect(ut?.payloadSpan).toEqual(rt?.payloadSpan);
        expect(ut?.colonSpan).toEqual(rt?.colonSpan);
      }
    });
  }
});
