/**
 * @see 003-json-schema-vocabulary.md — §2.3 enum variants: plain string → flat enum,
 *   per-member metadata → flat enum plus display-name extension by default, or oneOf[{const, title}] when requested
 * @see 003-json-schema-vocabulary.md — §3.2 dynamic sources: x-formspec-source,
 *   x-formspec-params (annotation-only, applies to {type: "string"})
 */
import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { EnumVariantsForm } from "../fixtures/chain-dsl/enum-variants.js";
import { assertValidJsonSchema, assertPropertyConstraints } from "../helpers/schema-assertions.js";

describe("Chain DSL Enums", () => {
  const { jsonSchema } = buildFormSchemas(EnumVariantsForm);
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  const { jsonSchema: oneOfJsonSchema } = buildFormSchemas(EnumVariantsForm, {
    enumSerialization: "oneOf",
  });
  const oneOfProperties = (oneOfJsonSchema as Record<string, unknown>)["properties"] as Record<
    string,
    Record<string, unknown>
  >;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    // 003 §2.3: "No per-member metadata → use flat enum: [a, b, c]"
    // Per JSON Schema spec: enum values are self-constraining; type is redundant alongside enum
    it("simpleStatus: no metadata → flat enum array", () => {
      assertPropertyConstraints(schema, "simpleStatus", {
        enum: ["draft", "active", "archived"],
      });
      const prop = properties["simpleStatus"];
      expect(prop["type"]).toBeUndefined();
    });

    it("labeledPriority: default enum serialization emits a complete display-name extension", () => {
      const prop = properties["labeledPriority"];
      expect(prop["enum"]).toEqual(["low", "medium", "high"]);
      expect(prop["x-formspec-display-names"]).toEqual({
        low: "Low Priority",
        medium: "Medium Priority",
        high: "High Priority",
      });
      expect(prop["oneOf"]).toBeUndefined();
    });

    it("labeledPriority: opt-in oneOf serialization emits const/title entries", () => {
      const prop = oneOfProperties["labeledPriority"];
      expect(prop["oneOf"]).toEqual([
        { const: "low", title: "Low Priority" },
        { const: "medium", title: "Medium Priority" },
        { const: "high", title: "High Priority" },
      ]);
      expect(prop["enum"]).toBeUndefined();
    });

    it("labeledPriority: oneOf should NOT have type alongside it", () => {
      const prop = oneOfProperties["labeledPriority"];
      expect(prop["type"]).toBeUndefined();
    });

    // 003 §3.2: "x-formspec-source is a string value = data source key,
    // applies to {type: 'string'}"
    it("country: dynamic enum has x-formspec-source", () => {
      const prop = properties["country"];
      expect(prop["type"]).toBe("string");
      expect(prop["x-formspec-source"]).toBe("countries");
      // Should NOT have static enum values
      expect(prop["enum"]).toBeUndefined();
      expect(prop["oneOf"]).toBeUndefined();
    });

    // 003 §3.2: "x-formspec-params is a string array, only on schemas with x-formspec-source"
    it("city: dynamic enum has x-formspec-source and x-formspec-params", () => {
      const prop = properties["city"];
      expect(prop["type"]).toBe("string");
      expect(prop["x-formspec-source"]).toBe("cities");
      expect(prop["x-formspec-params"]).toEqual(["country"]);
    });

    it("labeledPriority is required, others are optional", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("labeledPriority");
      expect(required).not.toContain("simpleStatus");
      expect(required).not.toContain("country");
      expect(required).not.toContain("city");
    });
  });
});
