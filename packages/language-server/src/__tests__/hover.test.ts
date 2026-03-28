import { describe, it, expect } from "vitest";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  defineConstraintTag,
  defineExtension,
} from "@formspec/core";
import type { MarkupContent } from "vscode-languageserver/node.js";
import { getHoverAtOffset, getHoverForTag } from "../providers/hover.js";

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

  it("returns hover content for extension-defined tags when extensions are provided", () => {
    const extension = defineExtension({
      extensionId: "x-test/numeric",
      constraintTags: [
        defineConstraintTag({
          tagName: "maxDecimalPlaces",
          constraintName: "MaxDecimalPlaces",
          parseValue: (raw) => Number(raw.trim()),
        }),
      ],
    });

    const hover = getHoverForTag("@maxDecimalPlaces", [extension]);
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("x-test/numeric");
      expect(hover.contents.value).toContain("@maxDecimalPlaces");
    }
  });

  it("returns hover content for date extension tags when extensions are provided", () => {
    const extension = defineExtension({
      extensionId: "x-test/date",
      constraintTags: [
        defineConstraintTag({
          tagName: "after",
          constraintName: "After",
          parseValue: (raw) => raw.trim(),
        }),
      ],
    });

    const hover = getHoverForTag("@after", [extension]);
    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("x-test/date");
      expect(hover.contents.value).toContain("@after");
    }
  });

  it("returns hover when the cursor is inside a tag name in a doc comment", () => {
    const source = "/** @minimum 0 */";
    const offset = source.indexOf("@minimum") + 2;
    const hover = getHoverAtOffset(source, offset);

    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("@minimum");
    }
  });

  it("returns null when the cursor is outside a doc comment", () => {
    const source = "const value = 1;";
    expect(getHoverAtOffset(source, source.length)).toBeNull();
  });

  it("returns argument hover info when the cursor is in a tag argument", () => {
    const source = "/** @minimum 0 */";
    const offset = source.indexOf("0");
    const hover = getHoverAtOffset(source, offset);

    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("Argument for @minimum");
      expect(hover.contents.value).toContain("<number>");
    }
  });

  it("returns hover when the cursor is inside a target specifier", () => {
    const source = "/** @apiName :plural homes */";
    const offset = source.indexOf("plural") + 1;
    const hover = getHoverAtOffset(source, offset);

    expect(hover).not.toBeNull();
    if (hover !== null && isMarkupContent(hover.contents)) {
      expect(hover.contents.value).toContain("Target for @apiName");
      expect(hover.contents.value).toContain("singular");
      expect(hover.contents.value).toContain("plural");
    }
  });
});
