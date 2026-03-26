import { describe, it, expect } from "vitest";
import { BUILTIN_CONSTRAINT_DEFINITIONS, defineConstraintTag, defineExtension } from "@formspec/core";
import { CompletionItemKind } from "vscode-languageserver/node.js";
import { getCompletionItems } from "../providers/completion.js";

describe("getCompletionItems", () => {
  it("returns one item per built-in constraint", () => {
    const items = getCompletionItems();
    const builtinCount = Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS).length;
    expect(items).toHaveLength(builtinCount);
  });

  it("prefixes each label with @", () => {
    const items = getCompletionItems();
    for (const item of items) {
      expect(item.label).toMatch(/^@/);
    }
  });

  it("uses CompletionItemKind.Keyword for all items", () => {
    const items = getCompletionItems();
    for (const item of items) {
      expect(item.kind).toBe(CompletionItemKind.Keyword);
    }
  });

  it("includes an item for every key in BUILTIN_CONSTRAINT_DEFINITIONS", () => {
    const items = getCompletionItems();
    const labels = items.map((item) => item.label);
    for (const name of Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS)) {
      expect(labels).toContain(`@${name}`);
    }
  });

  it("provides a non-empty detail string for each item", () => {
    const items = getCompletionItems();
    for (const item of items) {
      expect(typeof item.detail).toBe("string");
      expect((item.detail ?? "").length).toBeGreaterThan(0);
    }
  });

  it("includes @minimum completion", () => {
    const items = getCompletionItems();
    const minimum = items.find((item) => item.label === "@minimum");
    expect(minimum).toBeDefined();
    expect(minimum?.kind).toBe(CompletionItemKind.Keyword);
    expect(minimum?.detail).toContain("minimum");
  });

  it("includes @pattern completion", () => {
    const items = getCompletionItems();
    const pattern = items.find((item) => item.label === "@pattern");
    expect(pattern).toBeDefined();
  });

  it("includes @enumOptions completion", () => {
    const items = getCompletionItems();
    const enumOptions = items.find((item) => item.label === "@enumOptions");
    expect(enumOptions).toBeDefined();
  });

  it("includes extension-defined tags when extensions are provided", () => {
    const extension = defineExtension({
      extensionId: "x-test/numeric",
      constraintTags: [
        defineConstraintTag({
          tagName: "maxSigFig",
          constraintName: "MaxSigFig",
          parseValue: (raw) => Number(raw.trim()),
        }),
      ],
    });

    const items = getCompletionItems([extension]);
    expect(items.find((item) => item.label === "@maxSigFig")).toMatchObject({
      kind: CompletionItemKind.Keyword,
    });
  });

  it("includes date extension tags when extensions are provided", () => {
    const extension = defineExtension({
      extensionId: "x-test/date",
      constraintTags: [
        defineConstraintTag({
          tagName: "after",
          constraintName: "After",
          parseValue: (raw) => raw.trim(),
        }),
        defineConstraintTag({
          tagName: "before",
          constraintName: "Before",
          parseValue: (raw) => raw.trim(),
        }),
      ],
    });

    const items = getCompletionItems([extension]);
    expect(items.find((item) => item.label === "@after")).toMatchObject({
      kind: CompletionItemKind.Keyword,
    });
    expect(items.find((item) => item.label === "@before")).toMatchObject({
      kind: CompletionItemKind.Keyword,
    });
  });
});
