import { describe, expect, it } from "vitest";
import { parseCommentBlock, sliceCommentSpan } from "../index.js";

function expectTag<T>(value: T | undefined | null): T {
  expect(value).toBeDefined();
  return value as T;
}

describe("parseCommentBlock", () => {
  it("parses a single-line constraint tag with a path target", () => {
    const comment = "/** @minimum :percent 120 */";
    const parsed = parseCommentBlock(comment);
    const tag = expectTag(parsed.tags[0]);
    const colonSpan = expectTag(tag.colonSpan);
    const target = expectTag(tag.target);
    const argumentSpan = expectTag(tag.argumentSpan);

    expect(parsed.tags).toHaveLength(1);
    expect(tag.rawTagName).toBe("minimum");
    expect(tag.normalizedTagName).toBe("minimum");
    expect(tag.recognized).toBe(true);
    expect(target.rawText).toBe("percent");
    expect(target.path).toEqual({ segments: ["percent"] });
    expect(tag.argumentText).toBe("120");
    expect(sliceCommentSpan(comment, tag.tagNameSpan)).toBe("@minimum");
    expect(sliceCommentSpan(comment, colonSpan)).toBe(":");
    expect(sliceCommentSpan(comment, target.span)).toBe("percent");
    expect(sliceCommentSpan(comment, argumentSpan)).toBe("120");
  });

  it("parses multiple tags from the same comment block", () => {
    const comment = "/** @minimum :value 0 @maximum 100 */";
    const parsed = parseCommentBlock(comment);
    const secondTag = expectTag(parsed.tags[1]);

    expect(parsed.tags).toHaveLength(2);
    expect(parsed.tags[0]?.normalizedTagName).toBe("minimum");
    expect(parsed.tags[0]?.argumentText).toBe("0");
    expect(secondTag.normalizedTagName).toBe("maximum");
    expect(secondTag.argumentText).toBe("100");
    expect(sliceCommentSpan(comment, secondTag.tagNameSpan)).toBe("@maximum");
  });

  it("parses multi-line doc comments with leading stars and preserves dotted targets", () => {
    const comment = [
      "/**",
      " * @minimum :amount.currency 0",
      " * @description Human readable amount",
      " */",
    ].join("\n");
    const parsed = parseCommentBlock(comment);
    const firstTag = expectTag(parsed.tags[0]);
    const secondTag = expectTag(parsed.tags[1]);
    const secondArgumentSpan = expectTag(secondTag.argumentSpan);

    expect(parsed.tags).toHaveLength(2);
    expect(firstTag.target?.path).toEqual({ segments: ["amount", "currency"] });
    expect(firstTag.argumentText).toBe("0");
    expect(secondTag.argumentText).toBe("Human readable amount");
    expect(sliceCommentSpan(comment, firstTag.tagNameSpan)).toBe("@minimum");
    expect(sliceCommentSpan(comment, secondArgumentSpan)).toBe("Human readable amount");
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
    const tag = expectTag(parsed.tags[0]);
    const argumentSpan = expectTag(tag.argumentSpan);

    expect(parsed.tags).toHaveLength(1);
    expect(tag.recognized).toBe(false);
    expect(tag.normalizedTagName).toBe("unknownTag");
    expect(sliceCommentSpan(comment, tag.tagNameSpan)).toBe("@unknownTag");
    expect(sliceCommentSpan(comment, argumentSpan)).toBe("value");
  });

  it("classifies apiName singular and plural specifiers as variants", () => {
    const singular = parseCommentBlock("/** @apiName :singular home */");
    const plural = parseCommentBlock("/** @apiName :plural homes */");

    expect(singular.tags[0]?.target?.kind).toBe("variant");
    expect(plural.tags[0]?.target?.kind).toBe("variant");
    expect(plural.tags[0]?.target?.rawText).toBe("plural");
  });
});
