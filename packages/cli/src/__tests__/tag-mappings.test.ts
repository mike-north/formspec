/**
 * Tests for the TAG_MAPPINGS table in class-schema.ts.
 *
 * Verifies that TAG_MAPPINGS covers all expected tag names and has correct
 * metadata — this guards against accidental omissions when the table replaces
 * switch statements.
 */

import { describe, it, expect } from "vitest";
import { TAG_MAPPINGS } from "../generators/class-schema.js";

describe("TAG_MAPPINGS", () => {
  it("is a non-empty record", () => {
    expect(typeof TAG_MAPPINGS).toBe("object");
    expect(Object.keys(TAG_MAPPINGS).length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Every entry must declare at least one target key or extensionKey
  // -------------------------------------------------------------------------

  it("every entry has at least one of jsonSchemaKey, formSpecKey, or extensionKey", () => {
    for (const [tagName, mapping] of Object.entries(TAG_MAPPINGS)) {
      const hasTarget =
        mapping.jsonSchemaKey !== undefined ||
        mapping.formSpecKey !== undefined ||
        mapping.extensionKey !== undefined;
      expect(hasTarget, `TAG_MAPPINGS["${tagName}"] has no target key`).toBe(true);
    }
  });

  it("every entry has a valid valueType", () => {
    const validValueTypes = new Set(["number", "string", "boolean", "bare"]);
    for (const [tagName, mapping] of Object.entries(TAG_MAPPINGS)) {
      expect(
        validValueTypes.has(mapping.valueType),
        `TAG_MAPPINGS["${tagName}"].valueType "${mapping.valueType}" is not valid`
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Spot-check specific entries for correct configuration
  // -------------------------------------------------------------------------

  it("minimum maps to jsonSchemaKey 'minimum', formSpecKey 'min', valueType 'number'", () => {
    const entry = TAG_MAPPINGS["minimum"];
    expect(entry).toBeDefined();
    expect(entry?.jsonSchemaKey).toBe("minimum");
    expect(entry?.formSpecKey).toBe("min");
    expect(entry?.valueType).toBe("number");
  });

  it("maximum maps to jsonSchemaKey 'maximum', formSpecKey 'max', valueType 'number'", () => {
    const entry = TAG_MAPPINGS["maximum"];
    expect(entry?.jsonSchemaKey).toBe("maximum");
    expect(entry?.formSpecKey).toBe("max");
    expect(entry?.valueType).toBe("number");
  });

  it("displayName maps jsonSchemaKey 'title' and formSpecKey 'label'", () => {
    const entry = TAG_MAPPINGS["displayName"];
    expect(entry?.jsonSchemaKey).toBe("title");
    expect(entry?.formSpecKey).toBe("label");
    expect(entry?.valueType).toBe("string");
  });

  it("uniqueItems has valueType 'bare'", () => {
    expect(TAG_MAPPINGS["uniqueItems"]?.valueType).toBe("bare");
  });

  it("deprecated has valueType 'bare'", () => {
    expect(TAG_MAPPINGS["deprecated"]?.valueType).toBe("bare");
  });

  it("maxSigFig uses extensionKey 'x-formspec-maxSigFig'", () => {
    const entry = TAG_MAPPINGS["maxSigFig"];
    expect(entry?.extensionKey).toBe("x-formspec-maxSigFig");
    expect(entry?.valueType).toBe("number");
  });

  it("maxDecimalPlaces uses extensionKey 'x-formspec-maxDecimalPlaces'", () => {
    const entry = TAG_MAPPINGS["maxDecimalPlaces"];
    expect(entry?.extensionKey).toBe("x-formspec-maxDecimalPlaces");
    expect(entry?.valueType).toBe("number");
  });

  it("placeholder has only formSpecKey (no jsonSchemaKey)", () => {
    const entry = TAG_MAPPINGS["placeholder"];
    expect(entry?.formSpecKey).toBe("placeholder");
    expect(entry?.jsonSchemaKey).toBeUndefined();
    expect(entry?.valueType).toBe("string");
  });

  it("covers all numeric constraint tags", () => {
    const numericTags = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
    for (const tag of numericTags) {
      expect(TAG_MAPPINGS[tag], `missing TAG_MAPPINGS["${tag}"]`).toBeDefined();
      expect(TAG_MAPPINGS[tag]?.valueType).toBe("number");
    }
  });

  it("covers all string constraint tags", () => {
    const stringTags = ["minLength", "maxLength", "pattern"];
    for (const tag of stringTags) {
      expect(TAG_MAPPINGS[tag], `missing TAG_MAPPINGS["${tag}"]`).toBeDefined();
    }
  });

  it("covers all array constraint tags", () => {
    const arrayTags = ["minItems", "maxItems", "uniqueItems"];
    for (const tag of arrayTags) {
      expect(TAG_MAPPINGS[tag], `missing TAG_MAPPINGS["${tag}"]`).toBeDefined();
    }
  });

  it("covers annotation tags", () => {
    const annotationTags = ["displayName", "description", "defaultValue", "deprecated", "const", "format"];
    for (const tag of annotationTags) {
      expect(TAG_MAPPINGS[tag], `missing TAG_MAPPINGS["${tag}"]`).toBeDefined();
    }
  });

  it("covers UI-only annotation tags", () => {
    const uiTags = ["placeholder", "group", "order"];
    for (const tag of uiTags) {
      expect(TAG_MAPPINGS[tag], `missing TAG_MAPPINGS["${tag}"]`).toBeDefined();
    }
  });
});
