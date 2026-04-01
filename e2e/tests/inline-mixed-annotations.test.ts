/**
 * Regression test: inline mixed annotations with constraints.
 *
 * Reproduces the pattern from apps-extensibility-sdk where @displayName,
 * @description, and constraint tags (@minLength, @maxLength, @minimum,
 * @maximum) are all on a single JSDoc line per field.
 *
 * The expected behavior is that constraint tag arguments are parsed correctly
 * even when preceded by annotation tags with free-form text values.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Inline mixed annotations — @displayName + @description + constraints on one line", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-inline-mixed-"));
    const fixturePath = resolveFixture("tsdoc-class", "inline-mixed-annotations.ts");
    const result = runCli(["generate", fixturePath, "InlineMixedAnnotationsForm", "-o", tempDir]);
    expect(result.exitCode, `CLI failed with stderr: ${result.stderr}`).toBe(0);

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

  it("programName has minLength: 1 and maxLength: 80", () => {
    expect(properties["programName"]).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 80,
    });
  });

  it("programName has title from @displayName", () => {
    expect(properties["programName"]).toMatchObject({
      title: "Program Name",
    });
  });

  it("discountPercentage has minimum: 0 and maximum: 100", () => {
    expect(properties["discountPercentage"]).toMatchObject({
      type: "number",
      minimum: 0,
      maximum: 100,
    });
  });

  it("fixedDiscountAmount has minimum: 0", () => {
    expect(properties["fixedDiscountAmount"]).toMatchObject({
      type: "number",
      minimum: 0,
    });
  });

  it("minimumOrderAmount has minimum: 0", () => {
    expect(properties["minimumOrderAmount"]).toMatchObject({
      type: "number",
      minimum: 0,
    });
  });

  it("discountType is a string enum with 'percentage' and 'fixed'", () => {
    expect(properties["discountType"]).toHaveProperty("enum");
    const enumValues = properties["discountType"]["enum"] as string[];
    expect(enumValues).toContain("percentage");
    expect(enumValues).toContain("fixed");
  });

  it("active is boolean type", () => {
    expect(properties["active"]).toMatchObject({
      type: "boolean",
    });
  });
});
