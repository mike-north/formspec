/**
 * @see 003-json-schema-vocabulary.md — §2.5 nested objects:
 *   "Object with known properties → { type: object, properties: {...}, required: [...] }"
 * @see 003-json-schema-vocabulary.md — "Optional property → Absent from required array"
 * @see 003-json-schema-vocabulary.md — §B4: "additionalProperties is NOT set to false by default"
 * @see 003-json-schema-vocabulary.md — §2.4: "T[] → { type: array, items: <T schema> }"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
  assertNestedProperty,
} from "../helpers/schema-assertions.js";

describe("TSDoc Nested Objects", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-nesting-"));
    const fixturePath = resolveFixture("tsdoc-class", "nested-objects.ts");
    const result = runCli(["generate", fixturePath, "OrderWithNesting", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    properties = schema["properties"] as Record<string, Record<string, unknown>>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  // 003 §2.5: "Object with known properties → { type: object, properties, required }"
  it("customer is a nested object with properties", () => {
    const customer = properties["customer"];
    expect(customer["type"]).toBe("object");
    const customerProps = customer["properties"] as Record<string, unknown>;
    expect(customerProps).toHaveProperty("name");
    expect(customerProps).toHaveProperty("email");
    expect(customerProps).toHaveProperty("address");
  });

  // 003: "Optional property → Absent from required array"
  it("customer.address is optional — not in customer's required", () => {
    const customer = properties["customer"];
    const required = customer["required"] as string[] | undefined;
    if (required) {
      expect(required).not.toContain("address");
      expect(required).toContain("name");
      expect(required).toContain("email");
    }
  });

  // Deeply nested — customer.address.street/city/country
  it("deeply nested properties: customer.address.street exists with correct type", () => {
    assertNestedProperty(schema, "customer.address.street", { type: "string" });
    assertNestedProperty(schema, "customer.address.city", { type: "string" });
    assertNestedProperty(schema, "customer.address.country", { type: "string" });
  });

  // V2: nested object types always include additionalProperties: false
  it("nested objects set additionalProperties: false", () => {
    expect(properties["customer"]["additionalProperties"]).toBe(false);
  });

  // 003 §2.4: "T[] → { type: array, items: <T schema> }"
  it("items is an array of objects with productId and quantity", () => {
    const items = properties["items"];
    expect(items["type"]).toBe("array");
    const arrayItems = items["items"] as Record<string, unknown>;
    expect(arrayItems["type"]).toBe("object");
    const itemProps = arrayItems["properties"] as Record<string, unknown>;
    expect(itemProps).toHaveProperty("productId");
    expect(itemProps).toHaveProperty("quantity");
  });

  it("root-level required: orderId, customer, items — not notes", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("orderId");
    expect(required).toContain("customer");
    expect(required).toContain("items");
    expect(required).not.toContain("notes");
  });

});
