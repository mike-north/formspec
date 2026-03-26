/**
 * @see 002-constraint-tags.md §3.2: "@description → description field on JSON Schema object"
 * @see 002-constraint-tags.md §2.3: "@remarks fallback when no @description present"
 * @see 002-constraint-tags.md §2.3 C1: "@description wins over @remarks when both present"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Annotation: @description / @remarks", () => {
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

  // @see 002-constraint-tags.md §3.2: "class-level @description → root schema description"
  it("class-level @description produces root schema description", () => {
    // Spec 002 §3.2 maps @description to JSON Schema description.
    // Current implementation may not emit class-level description.
    expect(schema["description"]).toBe(
      "Collect detailed feedback from users about their experience."
    );
  });

  // @see 002-constraint-tags.md §3.2: "@description → property description"
  it("name: @description maps to property description", () => {
    // @see 002-constraint-tags.md §3.2: "@description tag maps to JSON Schema description keyword"
    // Current implementation does not emit description from @description on properties.
    expect(properties["name"]["description"]).toBe(
      "The user's full name as it appears on their ID."
    );
  });

  // @see 002-constraint-tags.md §2.3: "@remarks fallback — treated as @description when no @description present"
  it("comments: @remarks maps to description when no @description", () => {
    // Spec 002 §2.3: @remarks is used as a fallback for @description.
    // Current implementation may not emit description from @remarks.
    expect(properties["comments"]["description"]).toBe(
      "This field accepts markdown-formatted text."
    );
  });

  // @see 002-constraint-tags.md §2.3 C1: "@description wins when both @description and @remarks present"
  it("subject: @description wins over @remarks", () => {
    // Spec 002 §2.3 C1: explicit @description overrides @remarks.
    // Current implementation may not support this.
    expect(properties["subject"]["description"]).toBe("Explicit description wins.");
    expect(properties["subject"]["description"]).not.toContain("remarks");
  });

  // @see 002-constraint-tags.md §2.2: "absence of annotation → keyword not emitted"
  it("rating without @description has no description", () => {
    expect(properties["rating"]["description"]).toBeUndefined();
  });

  it("all four fields are required", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("comments");
    expect(required).toContain("subject");
    expect(required).toContain("rating");
  });
});
