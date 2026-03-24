import { describe, it, expect } from "vitest";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core";
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

  it("includes @Minimum completion", () => {
    const items = getCompletionItems();
    const minimum = items.find((item) => item.label === "@Minimum");
    expect(minimum).toBeDefined();
    expect(minimum?.kind).toBe(CompletionItemKind.Keyword);
    expect(minimum?.detail).toContain("Minimum");
  });

  it("includes @Pattern completion", () => {
    const items = getCompletionItems();
    const pattern = items.find((item) => item.label === "@Pattern");
    expect(pattern).toBeDefined();
  });

  it("includes @EnumOptions completion", () => {
    const items = getCompletionItems();
    const enumOptions = items.find((item) => item.label === "@EnumOptions");
    expect(enumOptions).toBeDefined();
  });
});
