import { describe, expect, it } from "vitest";
import {
  findCommentTagAtOffset,
  findEnclosingDocComment,
  getCommentCompletionContextAtOffset,
  getCommentCursorTargetAtOffset,
  getTagCompletionPrefixAtOffset,
} from "../index.js";

describe("cursor-context", () => {
  it("finds the enclosing doc comment and parses its tags", () => {
    const source = `
      class Foo {
        /** @minimum 0 */
        value!: number;
      }
    `;
    const offset = source.indexOf("@minimum") + 2;
    const comment = findEnclosingDocComment(source, offset);

    expect(comment).not.toBeNull();
    expect(comment?.parsed.tags).toHaveLength(1);
    expect(comment?.parsed.tags[0]?.normalizedTagName).toBe("minimum");
  });

  it("finds the tag under the cursor when hovering the tag name", () => {
    const source = "/** @maximum 100 */";
    const offset = source.indexOf("@maximum") + 3;
    const tag = findCommentTagAtOffset(source, offset);

    expect(tag?.normalizedTagName).toBe("maximum");
  });

  it("returns a tag-name completion prefix when the cursor is after @ letters", () => {
    const source = "/** @mi */";
    const offset = source.indexOf("@mi") + "@mi".length;
    expect(getTagCompletionPrefixAtOffset(source, offset)).toBe("mi");
  });

  it("returns null for completion prefix outside a doc comment", () => {
    expect(getTagCompletionPrefixAtOffset("const value = 1;", 5)).toBeNull();
  });

  it("classifies colon and target positions", () => {
    const source = "/** @minimum :amount 0 */";
    const colonOffset = source.indexOf(":");
    const targetOffset = source.indexOf("amount") + 2;

    expect(getCommentCursorTargetAtOffset(source, colonOffset)?.kind).toBe("colon");
    expect(getCommentCursorTargetAtOffset(source, targetOffset)?.kind).toBe("target");
  });

  it("classifies completion context for target and argument positions", () => {
    const source = "/** @minimum :amount 0 */";
    const targetOffset = source.indexOf("amount") + 2;
    const argumentOffset = source.indexOf("0");

    expect(getCommentCompletionContextAtOffset(source, targetOffset)).toMatchObject({
      kind: "target",
    });
    expect(getCommentCompletionContextAtOffset(source, argumentOffset)).toMatchObject({
      kind: "argument",
    });
  });
});
