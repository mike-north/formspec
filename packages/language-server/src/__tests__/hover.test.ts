import { describe, it, expect } from "vitest";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core";
import type { MarkupContent } from "vscode-languageserver/node.js";
import { getHoverForTag } from "../providers/hover.js";

/**
 * Type guard: narrows `Hover.contents` to `MarkupContent` (has `kind` and `value`).
 */
function isMarkupContent(contents: unknown): contents is MarkupContent {
  return (
    typeof contents === "object" && contents !== null && "kind" in contents && "value" in contents
  );
}

describe("getHoverForTag", () => {
  it("returns null for an empty string", () => {
    expect(getHoverForTag("")).toBeNull();
  });

  it("returns null for an unrecognized tag name", () => {
    expect(getHoverForTag("NonExistentTag")).toBeNull();
    expect(getHoverForTag("@NonExistentTag")).toBeNull();
  });

  it("returns null for a completely unknown string", () => {
    expect(getHoverForTag("not-a-constraint")).toBeNull();
  });

  it("returns hover content for every built-in constraint name", () => {
    for (const name of Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS)) {
      const hover = getHoverForTag(name);
      expect(hover, `expected hover for @${name}`).not.toBeNull();
      expect(isMarkupContent(hover?.contents)).toBe(true);
      if (hover !== null && isMarkupContent(hover.contents)) {
        expect(hover.contents.kind).toBe("markdown");
        expect(hover.contents.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("accepts @ prefix and returns the same result as without prefix", () => {
    for (const name of Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS)) {
      const withPrefix = getHoverForTag(`@${name}`);
      const withoutPrefix = getHoverForTag(name);
      expect(withPrefix).toEqual(withoutPrefix);
    }
  });

  it("returns markdown hover for @Minimum", () => {
    const hover = getHoverForTag("Minimum");
    expect(hover).not.toBeNull();
    expect(isMarkupContent(hover?.contents)).toBe(true);
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.kind).toBe("markdown");
      expect(hover.contents.value).toContain("@Minimum");
      expect(hover.contents.value).toContain("minimum");
    }
  });

  it("returns markdown hover for @Minimum with @ prefix", () => {
    const hover = getHoverForTag("@Minimum");
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("@Minimum");
    }
  });

  it("returns markdown hover for @Pattern", () => {
    const hover = getHoverForTag("Pattern");
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("@Pattern");
      expect(hover.contents.value).toContain("pattern");
    }
  });

  it("returns markdown hover for @EnumOptions", () => {
    const hover = getHoverForTag("EnumOptions");
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("@EnumOptions");
    }
  });

  it("is case-sensitive — lowercase names return null", () => {
    // The v2 hover provider uses canonical casing from BUILTIN_CONSTRAINT_DEFINITIONS
    expect(getHoverForTag("minimum")).toBeNull();
    expect(getHoverForTag("maximum")).toBeNull();
    expect(getHoverForTag("pattern")).toBeNull();
  });
});
