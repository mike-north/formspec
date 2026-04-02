/**
 * Tests for inline markdown preservation in free-form text tags.
 *
 * TSDoc parses backtick-wrapped text as excerpt-backed nodes.
 * When formspec extracts text for description, remarks, and deprecated
 * annotations, it should preserve that original markdown content.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

function generateSchema(typeName: string, tempDir: string): Record<string, unknown> {
  const fixturePath = resolveFixture("tsdoc-class", "markdown-in-annotations.ts");
  const result = runCli(["generate", fixturePath, typeName, "-o", tempDir]);
  expect(result.exitCode, result.stderr).toBe(0);

  const schemaFile = findSchemaFile(tempDir, "schema.json");
  expect(schemaFile).toBeDefined();
  if (!schemaFile) {
    throw new Error(`Schema file not found for ${typeName}`);
  }

  return JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
}

describe("Inline code spans in summary text", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-markdown-summary-"));
    schema = generateSchema("MarkdownInSummaryForm", tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("preserves backtick-wrapped function name in summary → description", () => {
    expect(schema).toBeDefined();
    expect(schema["description"]).toBe("Use `calculateDiscount(amount)` to compute the result.");
  });
});

describe("Inline code spans in @remarks", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-markdown-remarks-"));
    schema = generateSchema("MarkdownInRemarksForm", tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("preserves backtick-wrapped function name in @remarks → vendor extension", () => {
    expect(schema).toBeDefined();
    const remarksKey = Object.keys(schema).find((k) => k.endsWith("-remarks"));
    expect(remarksKey).toBeDefined();
    if (!remarksKey) {
      throw new Error("Expected remarks vendor extension key to be present");
    }
    expect(schema[remarksKey]).toBe("Use `formatCurrency(value)` for display purposes.");
  });
});

describe("Inline code spans in @deprecated message", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-markdown-deprecated-"));
    schema = generateSchema("MarkdownInDeprecatedForm", tempDir);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("preserves backtick-wrapped class name in @deprecated → deprecation description", () => {
    expect(schema).toBeDefined();
    expect(schema["deprecated"]).toBe(true);
    const deprecationKey = Object.keys(schema).find((k) => k.endsWith("-deprecation-description"));
    expect(deprecationKey).toBeDefined();
    if (!deprecationKey) {
      throw new Error("Expected deprecation description vendor extension key to be present");
    }
    expect(schema[deprecationKey]).toBe("Use `NewDiscountConfig` instead of this class.");
  });
});
