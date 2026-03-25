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

  it("returns markdown hover for @minimum (camelCase)", () => {
    const hover = getHoverForTag("minimum");
    expect(hover).not.toBeNull();
    expect(isMarkupContent(hover?.contents)).toBe(true);
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.kind).toBe("markdown");
      expect(hover.contents.value).toContain("minimum");
    }
  });

  it("returns markdown hover for @minimum with @ prefix", () => {
    const hover = getHoverForTag("@minimum");
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("minimum");
    }
  });

  it("returns markdown hover for @pattern (camelCase)", () => {
    const hover = getHoverForTag("pattern");
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("pattern");
    }
  });

  it("returns markdown hover for @enumOptions (camelCase)", () => {
    const hover = getHoverForTag("enumOptions");
    expect(hover).not.toBeNull();
  });

  it("accepts camelCase tag names", () => {
    // Users write camelCase tags: @minimum, @maximum, @pattern
    const minimumHover = getHoverForTag("minimum");
    expect(minimumHover).not.toBeNull();
    const maximumHover = getHoverForTag("maximum");
    expect(maximumHover).not.toBeNull();
    const patternHover = getHoverForTag("pattern");
    expect(patternHover).not.toBeNull();
  });

  it("accepts PascalCase tag names via normalization", () => {
    // PascalCase variants like @Minimum are normalized to camelCase
    const pascalCase = getHoverForTag("Minimum");
    const camelCase = getHoverForTag("minimum");
    expect(pascalCase).toEqual(camelCase);
  });
});
