/**
 * @see 003-json-schema-vocabulary.md — §2.3 enum variants: plain string → flat enum,
 *   per-member metadata → oneOf[{const, title}]
 * @see 003-json-schema-vocabulary.md — §3.2 dynamic sources: x-formspec-source,
 *   x-formspec-params (annotation-only, applies to {type: "string"})
 */
import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { EnumVariantsForm } from "../fixtures/chain-dsl/enum-variants.js";
import {
  assertValidJsonSchema,
  assertPropertyConstraints,
} from "../helpers/schema-assertions.js";

describe("Chain DSL Enums", () => {
  const { jsonSchema } = buildFormSchemas(EnumVariantsForm);
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;

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

    // 003 §2.3: "Per-member metadata → oneOf with const + title/description"
    it("labeledPriority: per-member labels → oneOf with const/title", () => {
      const prop = properties["labeledPriority"];
      expect(prop["oneOf"]).toEqual([
        { const: "low", title: "Low Priority" },
        { const: "medium", title: "Medium Priority" },
        { const: "high", title: "High Priority" },
      ]);
      // Must NOT also have a flat enum (would be redundant/conflicting)
      expect(prop["enum"]).toBeUndefined();
    });

    // 003 §2.3: Spec example shows oneOf WITHOUT type: "string" alongside it.
    // Labeled enums use oneOf with const values — type: "string" must be omitted
    // since oneOf already constrains the type.
    it("labeledPriority: oneOf should NOT have type alongside it", () => {
      const prop = properties["labeledPriority"];
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
