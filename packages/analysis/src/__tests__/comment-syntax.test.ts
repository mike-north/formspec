import { describe, expect, it } from "vitest";
import { extractCommentBlockTagTexts } from "../comment-syntax.js";

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
