/**
 * End-to-end coverage for `@example` → JSON Schema `examples` emission.
 *
 * Drives the full build pipeline (TypeScript source → canonical IR → JSON
 * Schema) so the extraction, accumulation, and emission stages are exercised
 * together against real TSDoc comments — the "build-level" proof requested in
 * issue #518.
 *
 * @see docs/002-tsdoc-grammar.md §2.3 (@example → ExampleAnnotation) and §3.2
 *   (repeated tags accumulate; JSON-or-string value parsing)
 * @see docs/003-json-schema-vocabulary.md §4.2 (`examples` is a standard
 *   annotation keyword FormSpec emits)
 * @see https://github.com/mike-north/formspec/issues/518
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSchemas } from "../src/generators/class-schema.js";

function schemaForSource(source: string, typeName: string): Record<string, unknown> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-example-emission-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  const result = generateSchemas({ filePath, typeName, errorReporting: "throw" });
  return result.jsonSchema.properties as Record<string, unknown>;
}

describe("@example → examples emission (issue #518)", () => {
  it("emits both values, in source order, for two @example tags on an interface field", () => {
    const properties = schemaForSource(
      [
        "export interface ContactForm {",
        "  /**",
        "   * @example alice@example.com",
        "   * @example bob@example.com",
        "   */",
        "  email: string;",
        "}",
      ].join("\n"),
      "ContactForm"
    );

    expect(properties["email"]).toMatchObject({
      type: "string",
      examples: ["alice@example.com", "bob@example.com"],
    });
  });

  it("parses a JSON-parseable @example payload and carries a non-JSON one as a string", () => {
    const properties = schemaForSource(
      [
        "export interface ServerForm {",
        '  /** @example {"host": "localhost", "port": 5432} */',
        "  primary: string;",
        "  /** @example just-a-label */",
        "  label: string;",
        "}",
      ].join("\n"),
      "ServerForm"
    );

    // JSON object payload parses to its value (spec 002 §3.2).
    expect(properties["primary"]).toMatchObject({
      examples: [{ host: "localhost", port: 5432 }],
    });
    // Non-JSON payload is carried verbatim as a string (spec 002 §3.2).
    expect(properties["label"]).toMatchObject({ examples: ["just-a-label"] });
  });

  it("omits examples when a field carries no @example tag", () => {
    const properties = schemaForSource(
      ["export interface PlainForm {", "  name: string;", "}"].join("\n"),
      "PlainForm"
    );

    expect(properties["name"]).not.toHaveProperty("examples");
  });
});
