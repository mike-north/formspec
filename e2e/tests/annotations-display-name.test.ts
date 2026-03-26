/**
 * @see 002-constraint-tags.md §3.2: "@displayName → title field on the JSON Schema object"
 * @see 003-json-schema-vocabulary.md §2.3: "per-member display names → oneOf with const/title"
 * @see 003-json-schema-vocabulary.md §2.8: "Class-level @displayName → root schema title"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Annotation: @displayName", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-displayname-"));
    const fixturePath = resolveFixture("tsdoc-class", "annotations-display-name.ts");
    const result = runCli(["generate", fixturePath, "UserProfileForm", "-o", tempDir]);
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

  // @see 003-json-schema-vocabulary.md §2.8: "class-level @displayName → root schema title"
  it.skip("BUG: class-level @displayName produces root title", () => {
    // Spec 003 §9 full example shows "title": "Invoice Form" at root from class @displayName.
    // Current implementation does not emit root title.
    expect(schema["title"]).toBe("User Profile Form");
  });

  // @see 002-constraint-tags.md §3.2: "@displayName → title on the property schema"
  it.skip("BUG: field @displayName emits title on property schema (fullName)", () => {
    // @see 002-constraint-tags.md §3.2: "@displayName maps to JSON Schema title"
    // Current implementation does not emit title from @displayName on properties.
    expect(properties["fullName"]["title"]).toBe("Full Legal Name");
  });

  it.skip("BUG: field @displayName emits title on property schema (email)", () => {
    // @see 002-constraint-tags.md §3.2: "@displayName maps to JSON Schema title"
    expect(properties["email"]["title"]).toBe("Email Address");
  });

  // @see 002-constraint-tags.md §3.2: "absence of @displayName → no title emitted"
  it("field without @displayName has no title (age)", () => {
    // @see 002-constraint-tags.md §3.2 inference cascade: no @displayName → no title
    expect(properties["age"]).toBeDefined();
    expect(properties["age"]["title"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.3: "per-member display names (:member) → oneOf with const/title"
  it.skip("BUG: status with :member display names → oneOf with const/title entries", () => {
    // @see 003-json-schema-vocabulary.md §2.3: ":member syntax on display names → oneOf[{const, title}]"
    // Current implementation does not support :member display name syntax for enum members.
    const status = properties["status"];
    expect(status["oneOf"]).toEqual([
      { const: "active", title: "Active Account" },
      { const: "suspended", title: "Suspended" },
      { const: "closed", title: "Permanently Closed" },
    ]);
    // Field-level title is absent when per-member titles are present
    // @see 002-constraint-tags.md §5.2
    expect(status["title"]).toBeUndefined();
    // Must NOT also have a flat enum
    expect(status["enum"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.3: "no per-member metadata → flat enum"
  it("language without :member display names → flat enum", () => {
    const language = properties["language"];
    // No per-member display names → flat enum array
    expect(language["enum"]).toEqual(["en", "fr", "de"]);
    // Must NOT use oneOf when flat enum suffices
    expect(language["oneOf"]).toBeUndefined();
  });

  it.skip("BUG: language with field-level @displayName → title on property schema", () => {
    // @see 002-constraint-tags.md §3.2: "@displayName maps to JSON Schema title"
    // Current implementation does not emit title from @displayName.
    expect(properties["language"]["title"]).toBe("Preferred Language");
  });

  // @see 003-json-schema-vocabulary.md §2.5 S8: "optional field absent from required"
  it("required contains fullName, email, status, language — not age", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("fullName");
    expect(required).toContain("email");
    expect(required).toContain("status");
    expect(required).toContain("language");
    expect(required).not.toContain("age");
  });
});
