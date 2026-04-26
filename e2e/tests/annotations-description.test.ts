/**
 * @see 002-tsdoc-grammar.md §2.3: Summary text → JSON Schema "description"
 * @see 002-tsdoc-grammar.md §2.3: @remarks → x-<vendor>-remarks extension keyword
 * @see 003-json-schema-vocabulary.md §3.2: x-<vendor>-remarks annotation keyword
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ESLint } from "eslint";
import type { ESLint as ESLintNamespace, Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";
import { meta, rules } from "@formspec/eslint-plugin";

describe("Annotation: summary text and @remarks", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-description-"));
    const fixturePath = resolveFixture("tsdoc-class", "annotations-description.ts");
    const result = runCli(["generate", fixturePath, "FeedbackForm", "-o", tempDir]);
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

  // @see 002-tsdoc-grammar.md §2.3: summary text → root JSON Schema description
  it("class-level summary text produces root schema description", () => {
    expect(schema["description"]).toBe("Form for collecting user feedback.");
  });

  // @see 002-tsdoc-grammar.md §2.3: summary text → property description
  it("name: summary text maps to property description", () => {
    expect(properties["name"]["description"]).toBe(
      "The user's full name as it appears on their ID."
    );
  });

  // @see 002-tsdoc-grammar.md §2.3: summary → description, @remarks → x-formspec-remarks
  it("comments: summary → description, @remarks → x-formspec-remarks", () => {
    expect(properties["comments"]["description"]).toBe("Free-form comments about the experience.");
    expect(properties["comments"]["x-formspec-remarks"]).toBe(
      "This field accepts markdown-formatted text."
    );
  });

  // @see 002-tsdoc-grammar.md §2.3: @remarks alone does NOT populate description
  it("notes: @remarks alone produces x-formspec-remarks but no description", () => {
    expect(properties["notes"]["description"]).toBeUndefined();
    expect(properties["notes"]["x-formspec-remarks"]).toBe("Remarks only, no summary text.");
  });

  it("notes: @remarks alone reports REMARKS_WITHOUT_SUMMARY through ESLint", async () => {
    const fixturePath = resolveFixture("tsdoc-class", "annotations-description.ts");
    // ESLint's plugin type and @typescript-eslint's RuleModule type are
    // structurally compatible at runtime, but their declarations diverge.
    const formspecPlugin = { meta, rules } as unknown as ESLintNamespace.Plugin;
    const overrideConfig = {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tsParser,
      },
      plugins: { formspec: formspecPlugin },
      rules: {
        "formspec/documentation/remarks-without-summary": "warn",
      },
    } satisfies Linter.Config;
    const eslint = new ESLint({
      cwd: path.dirname(fixturePath),
      overrideConfigFile: true,
      overrideConfig,
    });

    const [result] = await eslint.lintFiles([fixturePath]);
    if (result === undefined) throw new Error("Expected lint result");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      ruleId: "formspec/documentation/remarks-without-summary",
      severity: 1,
      messageId: "remarksWithoutSummary",
      line: 15,
    });
  });

  // @see 002-tsdoc-grammar.md §2.2: absence of annotation → keyword not emitted
  it("rating: no comment produces no description or remarks", () => {
    expect(properties["rating"]["description"]).toBeUndefined();
    expect(properties["rating"]["x-formspec-remarks"]).toBeUndefined();
  });

  it("all four fields are required", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("comments");
    expect(required).toContain("notes");
    expect(required).toContain("rating");
  });
});
