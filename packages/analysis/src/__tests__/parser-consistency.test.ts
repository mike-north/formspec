/**
 * Behavioral specification for `parseCommentBlock`.
 *
 * This file verifies that the regex-based comment parser produces correct
 * structural results for a representative set of comment strings. Every
 * assertion is derived from reading the comment syntax specification and
 * source rules — not from capturing program output.
 *
 * @see packages/analysis/src/comment-syntax.ts — `parseCommentBlock`, `ParsedCommentTag`
 */

import { describe, expect, it } from "vitest";
import { parseCommentBlock } from "../comment-syntax.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `parseCommentBlock(comment).tags` for the given raw comment string.
 * Offset is left at zero so spans are relative to the comment start.
 */
function tags(comment: string) {
  return parseCommentBlock(comment).tags;
}

// ---------------------------------------------------------------------------
// Basic single-tag comments
// ---------------------------------------------------------------------------

describe("parseCommentBlock — basic single-tag comments", () => {
  it("parses @minimum 0 (spec: numeric constraint, camelCase)", () => {
    // spec: tag name is lowercased on normalization, argument is the text after the tag
    const result = tags(`/** @minimum 0 */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.rawTagName).toBe("minimum");
    expect(tag?.normalizedTagName).toBe("minimum");
    expect(tag?.recognized).toBe(true);
    expect(tag?.argumentText).toBe("0");
    expect(tag?.target).toBeNull();
  });

  it("parses @maximum 100 (spec: numeric constraint, camelCase)", () => {
    const result = tags(`/** @maximum 100 */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.rawTagName).toBe("maximum");
    expect(tag?.normalizedTagName).toBe("maximum");
    expect(tag?.recognized).toBe(true);
    expect(tag?.argumentText).toBe("100");
    expect(tag?.target).toBeNull();
  });

  it("parses @Minimum 0 — PascalCase normalized to camelCase", () => {
    // spec: normalizeFormSpecTagName lowercases the first character only
    const result = tags(`/** @Minimum 0 */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.rawTagName).toBe("Minimum");
    expect(tag?.normalizedTagName).toBe("minimum");
    expect(tag?.recognized).toBe(true);
    expect(tag?.argumentText).toBe("0");
    expect(tag?.target).toBeNull();
  });

  it("parses @deprecated (spec: no-argument annotation tag)", () => {
    // spec: @deprecated requires no argument — argumentText should be empty
    const result = tags(`/** @deprecated */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.rawTagName).toBe("deprecated");
    expect(tag?.normalizedTagName).toBe("deprecated");
    expect(tag?.recognized).toBe(true);
    expect(tag?.argumentText).toBe("");
    expect(tag?.target).toBeNull();
    expect(tag?.argumentSpan).toBeNull();
  });

  it("parses @uniqueItems (spec: boolean flag, no argument required)", () => {
    const result = tags(`/** @uniqueItems */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("uniqueItems");
    expect(tag?.argumentText).toBe("");
    expect(tag?.target).toBeNull();
  });

  it("parses @foobar baz — unknown tag is emitted but not recognized", () => {
    // spec: unrecognized tags are still parsed; recognized:false is set
    const result = tags(`/** @foobar baz */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.rawTagName).toBe("foobar");
    expect(tag?.normalizedTagName).toBe("foobar");
    expect(tag?.recognized).toBe(false);
    expect(tag?.argumentText).toBe("baz");
    expect(tag?.target).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-tag comments
// ---------------------------------------------------------------------------

describe("parseCommentBlock — multiple tags", () => {
  it("parses @minimum and @maximum on separate lines", () => {
    // spec: each line is projected independently; tags across lines accumulate
    const comment = `/**\n * @minimum 0\n * @maximum 100\n */`;
    const result = tags(comment);
    expect(result).toHaveLength(2);

    const min = result.find((t) => t.normalizedTagName === "minimum");
    const max = result.find((t) => t.normalizedTagName === "maximum");

    expect(min?.argumentText).toBe("0");
    expect(min?.target).toBeNull();
    expect(max?.argumentText).toBe("100");
    expect(max?.target).toBeNull();
  });

  it("parses @minLength and @maxLength on the same line", () => {
    // spec: same-line tags are segmented by the next tag start position
    const comment = `/** @minLength 2 @maxLength 8 */`;
    const result = tags(comment);
    expect(result).toHaveLength(2);

    const minLen = result.find((t) => t.normalizedTagName === "minLength");
    const maxLen = result.find((t) => t.normalizedTagName === "maxLength");

    expect(minLen?.argumentText).toBe("2");
    expect(maxLen?.argumentText).toBe("8");
  });

  it("preserves order of tags across multiple lines", () => {
    const comment = [
      `/**`,
      ` * @minimum 1`,
      ` * @maximum 99`,
      ` * @pattern ^[a-z]+$`,
      ` */`,
    ].join("\n");
    const result = tags(comment);
    expect(result).toHaveLength(3);
    expect(result[0]?.normalizedTagName).toBe("minimum");
    expect(result[1]?.normalizedTagName).toBe("maximum");
    expect(result[2]?.normalizedTagName).toBe("pattern");
  });
});

// ---------------------------------------------------------------------------
// Target specifiers
// ---------------------------------------------------------------------------

describe("parseCommentBlock — target specifiers", () => {
  it("parses @minimum :amount.value 0 — dotted path target", () => {
    // spec: a target text containing '.' is classified as kind:"path"
    // valid:true because extractPathTarget(":amount.value") succeeds with empty remainingText
    const result = tags(`/** @minimum :amount.value 0 */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("minimum");
    expect(tag?.argumentText).toBe("0");
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.rawText).toBe("amount.value");
    expect(tag?.target?.kind).toBe("path");
    expect(tag?.target?.valid).toBe(true);
    expect(tag?.target?.path?.segments).toEqual(["amount", "value"]);
  });

  it("parses @displayName :draft Draft Label — ambiguous member/variant target", () => {
    // spec: displayName supports ["none","member","variant"]
    // "draft" is not "singular"/"plural" and doesn't contain "." so classifyTargetKind
    // sees both "member" and "variant" in supportedTargets → kind:"ambiguous"
    const result = tags(`/** @displayName :draft Draft Label */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("displayName");
    expect(tag?.argumentText).toBe("Draft Label");
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.rawText).toBe("draft");
    expect(tag?.target?.kind).toBe("ambiguous");
    expect(tag?.target?.valid).toBe(true);
  });

  it("parses @apiName :singular home — variant target", () => {
    // spec: "singular" is a reserved variant keyword → kind:"variant" regardless of tag definition
    const result = tags(`/** @apiName :singular home */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("apiName");
    expect(tag?.argumentText).toBe("home");
    expect(tag?.target).not.toBeNull();
    expect(tag?.target?.rawText).toBe("singular");
    expect(tag?.target?.kind).toBe("variant");
    expect(tag?.target?.valid).toBe(true);
  });

  it("parses @apiName :plural homes — variant target (plural)", () => {
    // spec: "plural" is also a reserved variant keyword → kind:"variant"
    const result = tags(`/** @apiName :plural homes */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.target?.rawText).toBe("plural");
    expect(tag?.target?.kind).toBe("variant");
    expect(tag?.argumentText).toBe("homes");
  });

  it("parses @discriminator :kind T — path target (discriminator only supports path)", () => {
    // spec: discriminator has supportedTargets:["path"] only
    // "kind" doesn't contain "." but the tag's supportedTargets includes "path" → kind:"path"
    const result = tags(`/** @discriminator :kind T */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("discriminator");
    expect(tag?.argumentText).toBe("T");
    expect(tag?.target?.rawText).toBe("kind");
    expect(tag?.target?.kind).toBe("path");
    expect(tag?.target?.valid).toBe(true);
  });

  it("parses multiple @displayName tags with different targets", () => {
    // spec: each line produces its own tag; duplicate tags with different targets are allowed
    const comment = [
      `/**`,
      ` * @displayName :draft Draft`,
      ` * @displayName :active Active`,
      ` */`,
    ].join("\n");
    const result = tags(comment);
    expect(result).toHaveLength(2);

    const draft = result.find((t) => t.target?.rawText === "draft");
    const active = result.find((t) => t.target?.rawText === "active");

    expect(draft?.argumentText).toBe("Draft");
    expect(draft?.target?.kind).toBe("ambiguous");
    expect(active?.argumentText).toBe("Active");
    expect(active?.target?.kind).toBe("ambiguous");
  });

  it("parses @apiName :singular and :plural pair on separate lines", () => {
    const comment = [
      `/**`,
      ` * @apiName :singular home`,
      ` * @apiName :plural homes`,
      ` */`,
    ].join("\n");
    const result = tags(comment);
    expect(result).toHaveLength(2);

    const singular = result.find((t) => t.target?.rawText === "singular");
    const plural = result.find((t) => t.target?.rawText === "plural");

    expect(singular?.argumentText).toBe("home");
    expect(singular?.target?.kind).toBe("variant");
    expect(plural?.argumentText).toBe("homes");
    expect(plural?.target?.kind).toBe("variant");
  });
});

// ---------------------------------------------------------------------------
// Special argument content
// ---------------------------------------------------------------------------

describe("parseCommentBlock — special argument content", () => {
  it("preserves @ characters inside @pattern value (spec: @ mid-value is not a new tag)", () => {
    // spec: isTagStart requires the preceding char to be whitespace or undefined.
    // The '@' characters inside the regex pattern are preceded by non-whitespace chars
    // ('[', '+') so they are NOT treated as new tag starts.
    const result = tags(`/** @pattern ^[^@]+@[^@]+$ */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("pattern");
    expect(tag?.argumentText).toBe("^[^@]+@[^@]+$");
    expect(tag?.target).toBeNull();
  });

  it("parses @enumOptions with a JSON array argument", () => {
    // spec: enumOptions takes a JSON array as its argument text
    const result = tags(`/** @enumOptions [{"value": "a"}] */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("enumOptions");
    expect(tag?.argumentText).toBe(`[{"value": "a"}]`);
    expect(tag?.target).toBeNull();
  });

  it("parses @defaultValue with a JSON object argument", () => {
    // spec: defaultValue takes an arbitrary JSON value as its argument text
    const result = tags(`/** @defaultValue {"key": "value"} */`);
    expect(result).toHaveLength(1);
    const [tag] = result;
    expect(tag?.normalizedTagName).toBe("defaultValue");
    expect(tag?.argumentText).toBe(`{"key": "value"}`);
    expect(tag?.target).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Comments with description text
// ---------------------------------------------------------------------------

describe("parseCommentBlock — comments with description text", () => {
  it("emits zero tags for an empty comment (/** */)", () => {
    // spec: no @ symbols → no tags
    const result = tags(`/** */`);
    expect(result).toHaveLength(0);
  });

  it("emits zero tags for a description-only comment", () => {
    // spec: no @ symbols → no tags
    const result = tags(`/** Just a description */`);
    expect(result).toHaveLength(0);
  });

  it("parses one tag from a description + tag comment", () => {
    // spec: the description text is ignored by parseCommentBlock; only tags are extracted
    const comment = `/**\n * A description.\n * @minimum 0\n */`;
    const result = tags(comment);
    expect(result).toHaveLength(1);
    expect(result[0]?.normalizedTagName).toBe("minimum");
    expect(result[0]?.argumentText).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Issue #424 — tag mid-prose
// ---------------------------------------------------------------------------

describe("parseCommentBlock — tag mid-prose (issue #424)", () => {
  it("treats @apiName in prose as a tag start (spec: any @ preceded by whitespace begins a tag)", () => {
    // spec: isTagStart returns true when the char before @ is undefined or whitespace.
    // In "Field with @apiName override.", the @ is preceded by a space → it IS a tag.
    // The parser therefore emits TWO @apiName tags: one from the prose line and one from
    // the dedicated block-tag line.
    const comment = [
      `/**`,
      ` * Field with @apiName override.`,
      ` * @apiName actual_name`,
      ` */`,
    ].join("\n");
    const result = tags(comment);
    expect(result).toHaveLength(2);

    // Both tags have the same normalized name
    expect(result.every((t) => t.normalizedTagName === "apiName")).toBe(true);

    // Prose tag: argument is the text from the end of @apiName to the end of the line segment
    const prosTag = result[0];
    expect(prosTag?.argumentText).toBe("override.");

    // Block tag: argument is "actual_name"
    const blockTag = result[1];
    expect(blockTag?.argumentText).toBe("actual_name");
  });

  it("does NOT treat @ inside a word (e.g. email address) as a tag start", () => {
    // spec: isTagStart requires previousChar to be whitespace or undefined.
    // In "user@example.com", the @ is preceded by 'r' (non-whitespace) → not a tag.
    const comment = `/** Contact user@example.com for help */`;
    const result = tags(comment);
    expect(result).toHaveLength(0);
  });

  it("treats @displayName mid-prose as a tag start (consistent with issue #424)", () => {
    // spec: same rule applies — whitespace before @ → tag start
    const comment = [
      `/**`,
      ` * Use the @displayName tag to set a label.`,
      ` * @displayName Actual Label`,
      ` */`,
    ].join("\n");
    const result = tags(comment);
    expect(result).toHaveLength(2);

    expect(result[0]?.normalizedTagName).toBe("displayName");
    expect(result[0]?.argumentText).toBe("tag to set a label.");

    expect(result[1]?.normalizedTagName).toBe("displayName");
    expect(result[1]?.argumentText).toBe("Actual Label");
  });
});

// ---------------------------------------------------------------------------
// Span correctness
// ---------------------------------------------------------------------------

describe("parseCommentBlock — span correctness", () => {
  it("tagNameSpan covers exactly the @<name> token in a single-line comment", () => {
    // `/** @minimum 0 */`
    //  0123456789...
    // The comment body starts at offset 0. After stripping '/**', the first
    // real character is ' @minimum 0 ' — but the rawOffsets map back to the
    // original comment string positions.
    // @minimum starts at position 4 in "/** @minimum 0 */"
    //   0='/', 1='*', 2='*', 3=' ', 4='@'
    // The tag name is "@minimum" → 8 chars (@ + 7 letters) → end at position 12
    const comment = `/** @minimum 0 */`;
    const [tag] = parseCommentBlock(comment, { offset: 0 }).tags;
    expect(tag?.tagNameSpan).not.toBeNull();
    // tagNameSpan covers '@minimum' = positions 4..12 in the comment string
    expect(tag?.tagNameSpan.start).toBe(4);
    expect(tag?.tagNameSpan.end).toBe(12);
  });

  it("argumentSpan covers exactly the argument text in a single-line comment", () => {
    // `/** @minimum 0 */`
    // argument "0" is at position 13 (after '@minimum ')
    const comment = `/** @minimum 0 */`;
    const [tag] = parseCommentBlock(comment, { offset: 0 }).tags;
    expect(tag?.argumentSpan).not.toBeNull();
    expect(tag?.argumentSpan?.start).toBe(13);
    expect(tag?.argumentSpan?.end).toBe(14);
    // Cross-check: slicing the comment string at argumentSpan gives "0"
    expect(comment.slice(tag?.argumentSpan?.start, tag?.argumentSpan?.end)).toBe("0");
  });

  it("spans are adjusted by the base offset when options.offset is provided", () => {
    // If the comment starts at byte offset 100 in the source file, all spans
    // must be shifted by 100.
    const comment = `/** @minimum 0 */`;
    const baseOffset = 100;
    const [tag] = parseCommentBlock(comment, { offset: baseOffset }).tags;
    expect(tag?.tagNameSpan.start).toBe(4 + baseOffset);
    expect(tag?.tagNameSpan.end).toBe(12 + baseOffset);
    expect(tag?.argumentSpan?.start).toBe(13 + baseOffset);
    expect(tag?.argumentSpan?.end).toBe(14 + baseOffset);
  });

  it("payloadSpan covers from the target colon through the end of the argument", () => {
    // `/** @minimum :amount.value 0 */`
    //  0         1         2         3
    //  0123456789012345678901234567890
    // '@minimum' at 4, space at 12, ':amount.value' starts at 13, '0' at 27
    // payloadSpan should cover ':amount.value 0' (positions 13..28)
    const comment = `/** @minimum :amount.value 0 */`;
    const [tag] = parseCommentBlock(comment, { offset: 0 }).tags;
    expect(tag?.payloadSpan).not.toBeNull();
    const slice = comment.slice(tag?.payloadSpan?.start, tag?.payloadSpan?.end);
    expect(slice).toBe(":amount.value 0");
  });

  it("target fullSpan covers from the colon to the end of the target word", () => {
    // `/** @minimum :amount.value 0 */`
    // target ':amount.value' → fullSpan from 13 to 26
    const comment = `/** @minimum :amount.value 0 */`;
    const [tag] = parseCommentBlock(comment, { offset: 0 }).tags;
    expect(tag?.target?.fullSpan).not.toBeNull();
    const slice = comment.slice(tag?.target?.fullSpan.start, tag?.target?.fullSpan.end);
    expect(slice).toBe(":amount.value");
  });
});

// ---------------------------------------------------------------------------
// parseCommentBlock output shape
// ---------------------------------------------------------------------------

describe("parseCommentBlock — return value shape", () => {
  it("returns commentText unchanged", () => {
    const comment = `/** @minimum 0 */`;
    const result = parseCommentBlock(comment);
    expect(result.commentText).toBe(comment);
  });

  it("returns the offset that was passed in options", () => {
    const comment = `/** @minimum 0 */`;
    const result = parseCommentBlock(comment, { offset: 42 });
    expect(result.offset).toBe(42);
  });

  it("defaults offset to 0 when not provided", () => {
    const comment = `/** @minimum 0 */`;
    const result = parseCommentBlock(comment);
    expect(result.offset).toBe(0);
  });

  it("returns an empty tags array for a comment with no tags", () => {
    const result = parseCommentBlock(`/** Just prose here */`);
    expect(result.tags).toHaveLength(0);
  });
});
