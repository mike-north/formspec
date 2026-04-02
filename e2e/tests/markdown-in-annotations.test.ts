/**
 * Tests for inline code span preservation in free-form text tags.
 *
 * TSDoc parses backtick-wrapped text as `DocCodeSpan` AST nodes.
 * When formspec extracts text for description, remarks, and deprecated
 * annotations, it should include the code span content as plain text
 * rather than dropping it entirely.
 *
 * KNOWN BUG: formspec currently strips DocCodeSpan content, producing
 * empty strings where backtick-wrapped text should appear.
 *
 * @see https://github.com/mike-north/formspec/issues/TBD
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Inline code spans in summary text", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-markdown-summary-"));
    const fixturePath = resolveFixture("tsdoc-class", "markdown-in-annotations.ts");
    const result = runCli([
      "generate",
      fixturePath,
      "MarkdownInSummaryForm",
      "-o",
      tempDir,
    ]);
    if (result.exitCode !== 0) {
      // Generation may succeed even with the bug — the content is just wrong
      console.warn("CLI stderr:", result.stderr);
    }
    const schemaFile = findSchemaFile(tempDir, "schema.json");
    if (schemaFile) {
      schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it.skip("preserves backtick-wrapped function name in summary → description", () => {
    // KNOWN BUG: DocCodeSpan content is stripped from summary text.
    // Expected: "Use calculateDiscount(amount) to compute the result."
    // Actual:   "Use  to compute the result."
    expect(schema).toBeDefined();
    expect(schema["description"]).toBe(
      "Use calculateDiscount(amount) to compute the result."
    );
  });
});

describe("Inline code spans in @remarks", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-markdown-remarks-"));
    const fixturePath = resolveFixture("tsdoc-class", "markdown-in-annotations.ts");
    const result = runCli([
      "generate",
      fixturePath,
      "MarkdownInRemarksForm",
      "-o",
      tempDir,
    ]);
    if (result.exitCode !== 0) {
      console.warn("CLI stderr:", result.stderr);
    }
    const schemaFile = findSchemaFile(tempDir, "schema.json");
    if (schemaFile) {
      schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it.skip("preserves backtick-wrapped function name in @remarks → vendor extension", () => {
    // KNOWN BUG: DocCodeSpan content is stripped from @remarks text.
    // The remarks value should contain the inline code content as plain text.
    expect(schema).toBeDefined();
    // Remarks maps to a vendor-prefixed extension key (e.g., x-formspec-remarks).
    // Find any key matching the pattern.
    const remarksKey = Object.keys(schema).find((k) => k.endsWith("-remarks"));
    expect(remarksKey).toBeDefined();
    expect(schema[remarksKey!]).toBe(
      "Use formatCurrency(value) for display purposes."
    );
  });
});

describe("Inline code spans in @deprecated message", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-markdown-deprecated-"));
    const fixturePath = resolveFixture("tsdoc-class", "markdown-in-annotations.ts");
    const result = runCli([
      "generate",
      fixturePath,
      "MarkdownInDeprecatedForm",
      "-o",
      tempDir,
    ]);
    if (result.exitCode !== 0) {
      console.warn("CLI stderr:", result.stderr);
    }
    const schemaFile = findSchemaFile(tempDir, "schema.json");
    if (schemaFile) {
      schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it.skip("preserves backtick-wrapped class name in @deprecated → deprecation description", () => {
    // KNOWN BUG: DocCodeSpan content is stripped from @deprecated message.
    // The deprecation description vendor extension should preserve inline code.
    expect(schema).toBeDefined();
    expect(schema["deprecated"]).toBe(true);
    const deprecationKey = Object.keys(schema).find((k) =>
      k.endsWith("-deprecation-description")
    );
    expect(deprecationKey).toBeDefined();
    expect(schema[deprecationKey!]).toBe(
      "Use NewDiscountConfig instead of this class."
    );
  });
});
