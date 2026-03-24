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
  loadExpected,
} from "../helpers/schema-assertions.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Chain DSL Enums", () => {
  const result = buildFormSchemas(EnumVariantsForm);
  const { jsonSchema, uiSchema } = result;
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    // 003 §2.3: "No per-member metadata → use flat enum: [a, b, c]"
    it("simpleStatus: no metadata → flat enum array", () => {
      assertPropertyConstraints(schema, "simpleStatus", {
        type: "string",
        enum: ["draft", "active", "archived"],
      });
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
    // BUG: Current output has both type: "string" and oneOf — type is redundant
    // when oneOf constrains to const string values.
    it.fails("labeledPriority: oneOf should NOT have type alongside it", () => {
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

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "chain-dsl");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "enum-variants.schema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/enum-variants.schema.json");
      expect(jsonSchema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "enum-variants.uischema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/enum-variants.uischema.json");
      expect(uiSchema).toEqual(expected);
    });
  });
});
