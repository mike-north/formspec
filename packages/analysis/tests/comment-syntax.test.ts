import { describe, expect, it } from "vitest";
import { extractCommentBlockTagTexts, parseCommentBlock } from "../src/comment-syntax.js";

describe("comment-syntax", () => {
  it("extracts repeated same-line block tags without swallowing later tags", () => {
    const comment = `
      /**
       * @remarks First remark. @deprecated Use replacement.
       * @remarks Second remark.
       */
    `;

    expect(extractCommentBlockTagTexts(comment, "remarks")).toEqual([
      "First remark.",
      "Second remark.",
    ]);
    expect(extractCommentBlockTagTexts(comment, "deprecated")).toEqual(["Use replacement."]);
  });

  it("keeps continuation-only block-tag payloads", () => {
    const comment = `
      /**
       * @remarks
       * First line of remarks.
       * Second line of remarks.
       */
    `;

    expect(extractCommentBlockTagTexts(comment, "remarks")).toEqual([
      "First line of remarks.\nSecond line of remarks.",
    ]);
  });
});

describe("parseCommentBlock", () => {
  // ---------------------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------------------

  it("parses a single-line comment with one tag", () => {
    // "/** @minimum 0 */" — offset 0
    // After stripping "/**" prefix and stripping trailing " */" the projected
    // text is "@minimum 0 " starting at raw offset 4.
    const result = parseCommentBlock("/** @minimum 0 */");

    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag?.normalizedTagName).toBe("minimum");
    expect(tag?.argumentText).toBe("0");
  });

  it("parses a multi-line comment and returns all tags in order", () => {
    // Three distinct tags across three body lines.
    const comment = "/**\n * @minimum 0\n * @maximum 100\n * @minLength 5\n */";
    const result = parseCommentBlock(comment);

    expect(result.tags).toHaveLength(3);
    expect(result.tags[0]?.normalizedTagName).toBe("minimum");
    expect(result.tags[1]?.normalizedTagName).toBe("maximum");
    expect(result.tags[2]?.normalizedTagName).toBe("minLength");
  });

  it("returns zero tags for an empty comment", () => {
    const result = parseCommentBlock("/** */");

    expect(result.tags).toHaveLength(0);
  });

  it("returns zero tags for a comment with only description text", () => {
    // No '@' characters that start a tag — no tags should be collected.
    const result = parseCommentBlock("/** Some descriptive text with no tags */");

    expect(result.tags).toHaveLength(0);
  });

  it("finds a tag that appears at the start of a body line", () => {
    // Tag begins immediately after the leading '* ' strip — no preceding text.
    const comment = "/**\n * @maximum 99\n */";
    const result = parseCommentBlock(comment);

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.normalizedTagName).toBe("maximum");
  });

  it("finds a tag that appears mid-line after description text", () => {
    // The tag follows plain text on the same projected line. isTagStart requires
    // the character before '@' to be whitespace or the beginning.
    const comment = "/** Some label @minimum 1 */";
    const result = parseCommentBlock(comment);

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.normalizedTagName).toBe("minimum");
    expect(result.tags[0]?.argumentText).toBe("1");
  });

  // ---------------------------------------------------------------------------
  // Tag name normalization
  // ---------------------------------------------------------------------------

  it("normalizes PascalCase tag name by lowercasing the first letter", () => {
    // normalizeConstraintTagName("Minimum") → "minimum"
    // spec: packages/core/src/types/constraint-definitions.ts §_normalizeConstraintTagName
    const result = parseCommentBlock("/** @Minimum 0 */");

    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag?.rawTagName).toBe("Minimum");
    expect(tag?.normalizedTagName).toBe("minimum");
  });

  it("leaves camelCase tag name unchanged after normalization", () => {
    // normalizeConstraintTagName("minLength") → "minLength" (idempotent)
    const result = parseCommentBlock("/** @minLength 5 */");

    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag?.rawTagName).toBe("minLength");
    expect(tag?.normalizedTagName).toBe("minLength");
  });

  // ---------------------------------------------------------------------------
  // Target specifier parsing
  // ---------------------------------------------------------------------------

  it("parses a path target specifier", () => {
    // ":amount.value" contains a dot → classified as "path"
    // spec: classifyTargetKind checks targetText.includes('.')
    const result = parseCommentBlock("/** @minimum :amount.value 0 */");

    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.kind).toBe("path");
    expect(tag?.target?.rawText).toBe("amount.value");
    expect(tag?.argumentText).toBe("0");
  });

  it("parses a member/variant target specifier on displayName", () => {
    // ":draft" on @displayName — displayName supports 'member' and 'variant'
    // without a dot or singular/plural keyword → classifies as "ambiguous"
    // spec: classifyTargetKind → both member and variant in supportedTargets → "ambiguous"
    const result = parseCommentBlock("/** @displayName :draft Draft Label */");

    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.kind).toBe("ambiguous");
    expect(tag?.target?.rawText).toBe("draft");
    expect(tag?.argumentText).toBe("Draft Label");
  });

  it("parses a variant target specifier when the target text is 'singular'", () => {
    // "singular" is hardcoded as variant in classifyTargetKind
    const result = parseCommentBlock("/** @apiName :singular home */");

    expect(result.tags).toHaveLength(1);
    const [tag] = result.tags;
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.kind).toBe("variant");
    expect(tag?.target?.rawText).toBe("singular");
    expect(tag?.argumentText).toBe("home");
  });

  it("produces a null target when no target specifier is present", () => {
    // "@minimum 0" has no colon → target must be null
    const result = parseCommentBlock("/** @minimum 0 */");

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.target).toBeNull();
    expect(result.tags[0]?.colonSpan).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Span accuracy
  // ---------------------------------------------------------------------------

  it("produces correct tagNameSpan and argumentSpan for a single-line comment", () => {
    // "/** @minimum 0 */"
    //  0123456789012345 6
    // commentBodyStart=3, bodyEnd=15 (length-2=15 since length=17)
    // Projected line: contentStart=4 ('space' at 3 is stripped, '@' at 4)
    // rawOffsets = [4,5,6,7,8,9,10,11,12,13,14]
    // text = "@minimum 0 "
    //
    // tagNameSpan covers "@minimum" (indices 0..7 in text)
    //   start = rawOffsets[0] = 4
    //   end   = rawOffsets[7] + 1 = 12
    //
    // argumentSpan covers "0" (index 9 in text, trimmedEnd=10)
    //   start = rawOffsets[9] = 13
    //   end   = rawOffsets[9] + 1 = 14
    const comment = "/** @minimum 0 */";
    const result = parseCommentBlock(comment);
    const [tag] = result.tags;

    expect(tag?.tagNameSpan).toEqual({ start: 4, end: 12 });
    expect(tag?.argumentSpan).toEqual({ start: 13, end: 14 });
    // Verify slicing back produces the correct text
    expect(comment.slice(4, 12)).toBe("@minimum");
    expect(comment.slice(13, 14)).toBe("0");
  });

  it("shifts all spans by the given offset option", () => {
    // With offset=10, every span value must increase by 10.
    const comment = "/** @minimum 0 */";
    const result = parseCommentBlock(comment, { offset: 10 });
    const [tag] = result.tags;

    expect(tag?.tagNameSpan).toEqual({ start: 14, end: 22 });
    expect(tag?.argumentSpan).toEqual({ start: 23, end: 24 });
    expect(result.offset).toBe(10);
  });

  it("fullSpan brackets the entire tag text including argument", () => {
    // "/** @minimum 0 */" — fullSpan should cover "@minimum 0"
    //   start = 4 (the '@'), end = 14 (one past '0')
    const comment = "/** @minimum 0 */";
    const result = parseCommentBlock(comment);
    const [tag] = result.tags;

    expect(tag?.fullSpan).toEqual({ start: 4, end: 14 });
    expect(comment.slice(4, 14)).toBe("@minimum 0");
  });

  it("produces correct spans for a path target comment", () => {
    // "/** @minimum :amount.value 0 */"
    //  0123456789012345678901234567890
    //              1111111111222222222
    // bodyStart=3, bodyEnd=29
    // text (offset 4 to 29) = "@minimum :amount.value 0 "
    //
    // target.fullSpan: covers ":amount.value" (text indices 9..21)
    //   start = rawOffsets[9] = 13
    //   end   = rawOffsets[21] + 1 = 26
    //
    // argumentSpan covers "0" (text index 23, trimmedEnd=24)
    //   start = rawOffsets[23] = 27
    //   end   = rawOffsets[23] + 1 = 28
    const comment = "/** @minimum :amount.value 0 */";
    const result = parseCommentBlock(comment);
    const [tag] = result.tags;

    expect(tag?.target?.fullSpan).toEqual({ start: 13, end: 26 });
    expect(comment.slice(13, 26)).toBe(":amount.value");
    expect(tag?.argumentSpan).toEqual({ start: 27, end: 28 });
    expect(comment.slice(27, 28)).toBe("0");
  });

  // ---------------------------------------------------------------------------
  // Special characters
  // ---------------------------------------------------------------------------

  it("preserves '@' characters inside pattern argument text", () => {
    // The regex argument itself contains '@' — the parser must not misidentify
    // these as tag starts (isTagStart requires preceding whitespace and a
    // letter immediately after, so '@[' and '@]' inside the pattern are safe).
    const result = parseCommentBlock("/** @pattern ^[^@]+@[^@]+$ */");

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.argumentText).toBe("^[^@]+@[^@]+$");
  });

  it("preserves curly braces inside enumOptions argument text", () => {
    const result = parseCommentBlock('/** @enumOptions [{"value": "a"}] */');

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.argumentText).toBe('[{"value": "a"}]');
  });

  // ---------------------------------------------------------------------------
  // recognized field
  // ---------------------------------------------------------------------------

  it("marks a known builtin tag as recognized", () => {
    // "@minimum" is defined in BUILTIN_TAG_DEFINITIONS
    const result = parseCommentBlock("/** @minimum 0 */");

    expect(result.tags[0]?.recognized).toBe(true);
  });

  it("marks an unknown tag as not recognized", () => {
    // "@foobar" is not in any registry
    const result = parseCommentBlock("/** @foobar 42 */");

    expect(result.tags[0]?.recognized).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("handles a tag at the very end of the comment with no trailing space", () => {
    // "/** @minimum 0*/" — body ends immediately before '*/'
    // The trimming of trailing whitespace must not consume the argument digit.
    const result = parseCommentBlock("/** @minimum 0*/");

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.argumentText).toBe("0");
  });

  it("parses multiple tags on the same line", () => {
    // "/** @minimum 0 @maximum 100 */"
    // collectTagStarts finds '@' at index 0 and '@' at index 11 in the projected text.
    const comment = "/** @minimum 0 @maximum 100 */";
    const result = parseCommentBlock(comment);

    expect(result.tags).toHaveLength(2);
    expect(result.tags[0]?.normalizedTagName).toBe("minimum");
    expect(result.tags[0]?.argumentText).toBe("0");
    expect(result.tags[1]?.normalizedTagName).toBe("maximum");
    expect(result.tags[1]?.argumentText).toBe("100");
  });

  it("parses a tag with no argument text", () => {
    // "@deprecated" has no argument — argumentText should be empty, argumentSpan null
    const result = parseCommentBlock("/** @deprecated */");

    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.argumentText).toBe("");
    expect(result.tags[0]?.argumentSpan).toBeNull();
    expect(result.tags[0]?.payloadSpan).toBeNull();
  });
});
