import { describe, expect, it } from "vitest";
import {
  parseCommentBlock,
  sliceCommentSpan,
} from "../index.js";

describe("parseCommentBlock", () => {
  it("parses a single-line constraint tag with a path target", () => {
    const comment = "/** @minimum :percent 120 */";
    const parsed = parseCommentBlock(comment);
    const tag = parsed.tags[0];

    expect(parsed.tags).toHaveLength(1);
    expect(tag?.rawTagName).toBe("minimum");
    expect(tag?.normalizedTagName).toBe("minimum");
    expect(tag?.recognized).toBe(true);
    expect(tag?.target?.rawText).toBe("percent");
    expect(tag?.target?.path).toEqual({ segments: ["percent"] });
    expect(tag?.argumentText).toBe("120");
    expect(sliceCommentSpan(comment, tag!.tagNameSpan)).toBe("@minimum");
    expect(sliceCommentSpan(comment, tag!.colonSpan!)).toBe(":");
    expect(sliceCommentSpan(comment, tag!.target!.span)).toBe("percent");
    expect(sliceCommentSpan(comment, tag!.argumentSpan!)).toBe("120");
  });

  it("parses multiple tags from the same comment block", () => {
    const comment = "/** @minimum :value 0 @maximum 100 */";
    const parsed = parseCommentBlock(comment);

    expect(parsed.tags).toHaveLength(2);
    expect(parsed.tags[0]?.normalizedTagName).toBe("minimum");
    expect(parsed.tags[0]?.argumentText).toBe("0");
    expect(parsed.tags[1]?.normalizedTagName).toBe("maximum");
    expect(parsed.tags[1]?.argumentText).toBe("100");
    expect(sliceCommentSpan(comment, parsed.tags[1]!.tagNameSpan)).toBe("@maximum");
  });

  it("parses multi-line doc comments with leading stars and preserves dotted targets", () => {
    const comment = [
      "/**",
      " * @minimum :amount.currency 0",
      " * @description Human readable amount",
      " */",
    ].join("\n");
    const parsed = parseCommentBlock(comment);

    expect(parsed.tags).toHaveLength(2);
    expect(parsed.tags[0]?.target?.path).toEqual({ segments: ["amount", "currency"] });
    expect(parsed.tags[0]?.argumentText).toBe("0");
    expect(parsed.tags[1]?.argumentText).toBe("Human readable amount");
    expect(sliceCommentSpan(comment, parsed.tags[0]!.tagNameSpan)).toBe("@minimum");
    expect(sliceCommentSpan(comment, parsed.tags[1]!.argumentSpan!)).toBe("Human readable amount");
  });

  it("does not split a single tag when the argument contains @", () => {
    const comment = "/** @pattern ^foo@bar\\.com$ */";
    const parsed = parseCommentBlock(comment);

    expect(parsed.tags).toHaveLength(1);
    expect(parsed.tags[0]?.normalizedTagName).toBe("pattern");
    expect(parsed.tags[0]?.argumentText).toBe("^foo@bar\\.com$");
  });

  it("marks unknown tags as unrecognized while still exposing spans", () => {
    const comment = "/** @unknownTag value */";
    const parsed = parseCommentBlock(comment);
    const tag = parsed.tags[0];

    expect(parsed.tags).toHaveLength(1);
    expect(tag?.recognized).toBe(false);
    expect(tag?.normalizedTagName).toBe("unknownTag");
    expect(sliceCommentSpan(comment, tag!.tagNameSpan)).toBe("@unknownTag");
    expect(sliceCommentSpan(comment, tag!.argumentSpan!)).toBe("value");
  });
});
