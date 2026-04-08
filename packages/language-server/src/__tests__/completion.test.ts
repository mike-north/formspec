import { describe, it, expect } from "vitest";
import { defineConstraintTag, defineExtension } from "@formspec/core";
import {
  type FormSpecSerializedCompletionContext,
} from "@formspec/analysis";
import { getAllTagDefinitions } from "@formspec/analysis/internal";
import { CompletionItemKind } from "vscode-languageserver/node.js";
import { getCompletionItems, getCompletionItemsAtOffset } from "../providers/completion.js";

describe("getCompletionItems", () => {
  it("returns one item per built-in tag", () => {
    const items = getCompletionItems();
    expect(items).toHaveLength(getAllTagDefinitions().length);
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

  it("includes an item for every built-in tag", () => {
    const items = getCompletionItems();
    const labels = items.map((item) => item.label);
    for (const name of getAllTagDefinitions().map((tag) => tag.canonicalName)) {
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

  it("includes @discriminator completion", () => {
    const items = getCompletionItems();
    const discriminator = items.find((item) => item.label === "@discriminator");
    expect(discriminator).toBeDefined();
    expect(discriminator?.kind).toBe(CompletionItemKind.Keyword);
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

  it("returns no completions outside a doc comment", () => {
    const source = "const value = 1;";
    expect(getCompletionItemsAtOffset(source, source.length)).toEqual([]);
  });

  it("filters tag completions by the in-comment @ prefix at the cursor", () => {
    const source = "/** @mi */";
    const offset = source.indexOf("@mi") + "@mi".length;
    const items = getCompletionItemsAtOffset(source, offset);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.label.startsWith("@mi"))).toBe(true);
    expect(items.find((item) => item.label === "@minimum")).toBeDefined();
  });

  it("returns no completions when the cursor is not in a tag-name context", () => {
    const source = "/** @minimum 0 */";
    const offset = source.indexOf("0");
    expect(getCompletionItemsAtOffset(source, offset)).toEqual([]);
  });

  it("returns variant target completions for tags that support singular/plural specifiers", () => {
    const source = "/** @apiName : */";
    const offset = source.indexOf(":") + 1;
    const items = getCompletionItemsAtOffset(source, offset);

    expect(items.map((item) => item.label)).toContain("singular");
    expect(items.map((item) => item.label)).toContain("plural");
  });

  it("returns local type parameter completions for discriminator argument positions", () => {
    const source = `
      /**
       * @discriminator :kind T
       */
      interface TaggedValue<T> {
        kind: string;
        id: string;
      }
    `;
    const offset = source.indexOf("@discriminator :kind ") + "@discriminator :kind ".length;
    const semanticContext: FormSpecSerializedCompletionContext = {
      kind: "argument",
      semantic: {
        tagName: "discriminator",
        tagDefinition: null,
        placement: "interface",
        contextualSignatures: [],
        supportedTargets: ["none", "path"],
        targetCompletions: ["kind", "id"],
        compatiblePathTargets: ["kind", "id"],
        valueLabels: ["<typeParam>"],
        argumentCompletions: ["T"],
        contextualTagHoverMarkdown: null,
        signatures: [],
        tagHoverMarkdown: null,
        targetHoverMarkdown: null,
        argumentHoverMarkdown: null,
      },
      valueLabels: ["<typeParam>"],
    };

    const items = getCompletionItemsAtOffset(source, offset, undefined, semanticContext);
    expect(items.map((item) => item.label)).toEqual(["T"]);
    expect(items[0]?.kind).toBe(CompletionItemKind.TypeParameter);
  });

  it("prefers plugin-provided semantic target completions when available", () => {
    const source = "/** @minimum : */";
    const offset = source.indexOf(":") + 1;
    const semanticContext: FormSpecSerializedCompletionContext = {
      kind: "target",
      semantic: {
        tagName: "minimum",
        tagDefinition: null,
        placement: "class-field",
        contextualSignatures: [],
        supportedTargets: ["none", "path"],
        targetCompletions: ["amount", "discount.percent"],
        compatiblePathTargets: ["amount", "discount.percent"],
        valueLabels: ["<number>"],
        argumentCompletions: [],
        contextualTagHoverMarkdown: null,
        signatures: [],
        tagHoverMarkdown: null,
        targetHoverMarkdown: null,
        argumentHoverMarkdown: null,
      },
    };

    const items = getCompletionItemsAtOffset(source, offset, undefined, semanticContext);
    expect(items.map((item) => item.label)).toEqual(["amount", "discount.percent"]);
  });
});
