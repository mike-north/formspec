/**
 * @see 002-constraint-tags.md §2.2: "@placeholder → UI-only annotation (not in JSON Schema)"
 * @see 003-json-schema-vocabulary.md §2.8: "@deprecated → deprecated: true"
 * @see 002-constraint-tags.md §3.2: "@defaultValue → default keyword"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Annotation: @placeholder / @deprecated / @defaultValue", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;
  let uischema: Record<string, unknown> | undefined;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-metadata-"));
    const fixturePath = resolveFixture("tsdoc-class", "annotations-metadata.ts");
    const result = runCli(["generate", fixturePath, "MetadataForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    properties = schema["properties"] as Record<string, Record<string, unknown>>;

    const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
    if (uischemaFile) {
      uischema = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as Record<string, unknown>;
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("@placeholder — UI-only, not in JSON Schema", () => {
    // @see 002-constraint-tags.md §2.2: "@placeholder is a UI annotation — NOT emitted in JSON Schema"
    it("email: @placeholder does NOT appear in JSON Schema", () => {
      expect(properties["email"]).toBeDefined();
      // @placeholder must NOT appear as a JSON Schema keyword
      expect(properties["email"]["placeholder"]).toBeUndefined();
    });

    it("quantity: @placeholder does NOT appear in JSON Schema", () => {
      expect(properties["quantity"]).toBeDefined();
      expect(properties["quantity"]["placeholder"]).toBeUndefined();
    });

    // @see 002-constraint-tags.md §2.2: "@placeholder appears in UI Schema options.placeholder"
      it("email @placeholder appears in UI Schema options.placeholder", () => {
      // Spec 002 §2.2: @placeholder → UI Schema Control options.placeholder.
      // Expected: { type: "Control", scope: "#/properties/email", options: { placeholder: "Enter your email address" } }
      if (!uischema) throw new Error("UI schema not loaded");
      const elements = uischema["elements"] as Record<string, unknown>[];
      const emailControl = elements.find((el) => el["scope"] === "#/properties/email");
      expect(emailControl).toBeDefined();
      if (!emailControl) return;
      const options = emailControl["options"] as Record<string, unknown> | undefined;
      expect(options).toBeDefined();
      expect(options?.["placeholder"]).toBe("Enter your email address");
    });

      it("quantity @placeholder appears in UI Schema options.placeholder", () => {
      if (!uischema) throw new Error("UI schema not loaded");
      const elements = uischema["elements"] as Record<string, unknown>[];
      const quantityControl = elements.find((el) => el["scope"] === "#/properties/quantity");
      expect(quantityControl).toBeDefined();
      if (!quantityControl) return;
      const options = quantityControl["options"] as Record<string, unknown> | undefined;
      expect(options).toBeDefined();
      expect(options?.["placeholder"]).toBe("0");
    });
  });

  describe("@deprecated — JSON Schema deprecated: true", () => {
    // @see 003-json-schema-vocabulary.md §2.8: "@deprecated (bare) → deprecated: true"
    it("anotherOldField: bare @deprecated emits deprecated: true", () => {
      expect(properties["anotherOldField"]["deprecated"]).toBe(true);
    });

    // @see 003-json-schema-vocabulary.md §2.8: "@deprecated with message still emits deprecated: true"
    it("oldField: @deprecated with message emits deprecated: true", () => {
      // The message text "Use newField instead" is IR-only — not a JSON Schema keyword
      expect(properties["oldField"]["deprecated"]).toBe(true);
    });

    it("oldField deprecation message is preserved in the JSON Schema extension keyword", () => {
      expect(properties["oldField"]["x-formspec-deprecation-description"]).toBe(
        "Use newField instead"
      );
    });
  });

  describe("@defaultValue — JSON Schema default keyword", () => {
    // @see 002-constraint-tags.md §3.2: "@defaultValue → default keyword with parsed value"

    it('status @defaultValue "pending" → default: "pending"', () => {
      // @see 002-constraint-tags.md §3.2: string default value
      expect(properties["status"]["default"]).toBe("pending");
    });

    it("count @defaultValue 0 → default: 0", () => {
      // @see 002-constraint-tags.md §3.2: numeric default value
      expect(properties["count"]["default"]).toBe(0);
    });

    it("enabled @defaultValue false → default: false", () => {
      // @see 002-constraint-tags.md §3.2: boolean default value
      expect(properties["enabled"]["default"]).toBe(false);
    });

    it("nickname @defaultValue null → default: null", () => {
      // @see 002-constraint-tags.md §3.2: null default value
      expect(properties["nickname"]["default"]).toBeNull();
    });
  });

  it("requiredField is in required; @defaultValue and optional fields are not", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("requiredField");
    expect(required).toContain("email");
    expect(required).toContain("quantity");
    // All fields with @defaultValue or ? are optional
    expect(required).not.toContain("status");
    expect(required).not.toContain("count");
    expect(required).not.toContain("enabled");
    expect(required).not.toContain("nickname");
    expect(required).not.toContain("oldField");
    expect(required).not.toContain("anotherOldField");
  });
});
