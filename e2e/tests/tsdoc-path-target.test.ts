/**
 * E2E tests for path-target constraint syntax (:fieldName modifier).
 *
 * The path-target syntax allows targeting a sub-property of a referenced type:
 *   @Minimum :value 0   →  constrains MonetaryAmount.value, not the field itself
 *
 * JSON Schema 2020-12 (since draft 2019-09): $ref and sibling keywords are
 * independent assertions, so path-targeted constraints are emitted as $ref with
 * sibling `properties` — no allOf wrapper (see issue #364).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("TSDoc Path-Target Constraints", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-path-target-"));
    const fixturePath = resolveFixture("tsdoc-class", "path-target-constraints.ts");
    const result = runCli(["generate", fixturePath, "Invoice", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("has correct schema structure", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(schema).toHaveProperty("properties");
    expect(schema).toHaveProperty("$defs");
  });

  it("defines MonetaryAmount in $defs", () => {
    const defs = schema["$defs"] as Record<string, unknown>;
    expect(defs).toHaveProperty("MonetaryAmount");
    const def = defs["MonetaryAmount"] as Record<string, unknown>;
    expect(def).toHaveProperty("type", "object");
  });

  describe("path-targeted constraints on reference type", () => {
    it("total field emits $ref with sibling property constraints (no allOf)", () => {
      // JSON Schema 2020-12: $ref with sibling keywords — no allOf wrapper (issue #364)
      const properties = schema["properties"] as Record<string, unknown>;
      const total = properties["total"] as Record<string, unknown>;
      expect(total).toHaveProperty("$ref", "#/$defs/MonetaryAmount");
      expect(total).not.toHaveProperty("allOf");
      const overrideProps = total["properties"] as Record<string, unknown>;
      expect(overrideProps).toBeDefined();
      expect(overrideProps["value"]).toMatchObject({ minimum: 0, maximum: 9999999.99 });
    });
  });

  describe("path-targeted string constraints", () => {
    it("discount field emits $ref with sibling property constraints (no allOf)", () => {
      // JSON Schema 2020-12: $ref with sibling keywords — no allOf wrapper (issue #364)
      const properties = schema["properties"] as Record<string, unknown>;
      const discount = properties["discount"] as Record<string, unknown>;
      expect(discount).toHaveProperty("$ref", "#/$defs/MonetaryAmount");
      expect(discount).not.toHaveProperty("allOf");
      const overrideProps = discount["properties"] as Record<string, unknown>;
      expect(overrideProps).toBeDefined();
      const currency = overrideProps["currency"] as Record<string, unknown>;
      expect(currency).toMatchObject({
        minLength: 3,
        maxLength: 3,
        pattern: "^[A-Z]{3}$",
      });
    });
  });

  describe("array transparency", () => {
    it("lineItems applies path-targeted constraints to items — no allOf on items", () => {
      // Array items: $ref with sibling keywords — no allOf wrapper (issue #364)
      const properties = schema["properties"] as Record<string, unknown>;
      const lineItems = properties["lineItems"] as Record<string, unknown>;
      expect(lineItems).toHaveProperty("type", "array");
      const items = lineItems["items"] as Record<string, unknown>;
      expect(items).toHaveProperty("$ref", "#/$defs/MonetaryAmount");
      expect(items).not.toHaveProperty("allOf");
      const overrideProps = items["properties"] as Record<string, unknown>;
      expect(overrideProps).toBeDefined();
      expect(overrideProps["value"]).toMatchObject({ minimum: 0 });
    });
  });

  it("all three fields are required", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("total");
    expect(required).toContain("discount");
    expect(required).toContain("lineItems");
  });

  describe("invalid path-target diagnostics", () => {
    it("fails validation when the resolved target type is incompatible", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-path-target-invalid-"));
      try {
        const fixturePath = resolveFixture("tsdoc-class", "path-target-invalid-constraints.ts");
        const result = runCli([
          "generate",
          fixturePath,
          "BrokenInvoice",
          "--validate-only",
          "-o",
          tempDir,
        ]);

        expect(result.exitCode).not.toBe(0);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toContain('Target "currency"');
        expect(output).toContain(
          'constraint "minimum" is only valid on number targets, but field type is "string"'
        );
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true });
        }
      }
    });
  });
});
