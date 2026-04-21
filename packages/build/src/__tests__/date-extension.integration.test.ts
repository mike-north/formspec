import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defineCustomType, defineExtension } from "@formspec/core/internals";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";
import { createExtensionRegistry } from "../extensions/index.js";
import {
  createDateExtensionRegistry,
  parseCanonicalDateTime,
} from "./fixtures/example-date-extension.js";

interface NullableDateTimeSchema {
  readonly $ref?: string;
  readonly oneOf?: readonly unknown[];
  readonly ["x-formspec-after"]?: unknown;
}

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-date-ext-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

function createBuiltInDateRegistry() {
  return createExtensionRegistry([
    defineExtension({
      extensionId: "x-example/date-object",
      types: [
        defineCustomType({
          typeName: "DateObject",
          tsTypeNames: ["Date"],
          toJsonSchema: () => ({
            type: "string",
            format: "date-time",
            "x-formspec-date-object": true,
          }),
        }),
      ],
    }),
  ]);
}

function createUnsupportedArrayRegistry() {
  return createExtensionRegistry([
    defineExtension({
      extensionId: "x-example/array-object",
      types: [
        defineCustomType({
          typeName: "ArrayObject",
          tsTypeNames: ["Array"],
          toJsonSchema: () => ({
            type: "array",
            "x-formspec-array-object": true,
          }),
        }),
      ],
    }),
  ]);
}

function createInvalidTypeNameRegistry() {
  return createExtensionRegistry([
    defineExtension({
      extensionId: "x-example/invalid-type",
      types: [
        defineCustomType({
          typeName: "InvalidType",
          tsTypeNames: ["Not A Type"],
          toJsonSchema: () => ({
            type: "string",
            "x-formspec-invalid-type": true,
          }),
        }),
      ],
    }),
  ]);
}

function getThrownMessage(action: () => void): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Expected action to throw");
}

describe("date extension integration", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("canonicalizes ISO-8601 date-times with explicit timezone and millisecond precision", () => {
    expect(parseCanonicalDateTime("2026-03-01T08:00:00.000-08:00")).toBe(
      "2026-03-01T16:00:00.000Z"
    );
    expect(parseCanonicalDateTime("2026-03-01T16:00:00.000Z")).toBe("2026-03-01T16:00:00.000Z");
    expect(() => parseCanonicalDateTime("2026-03-01T16:00:00Z")).toThrow(
      /exactly millisecond precision/
    );
    expect(() => parseCanonicalDateTime("2026-03-01T16:00:00.000")).toThrow(/explicit timezone/);
  });

  it("generates JSON Schema and UI Schema through the public class-generation API", () => {
    const filePath = writeTempSource(`
      export type DateTime = string;
      export type NullableDateTime = DateTime | null;

      export interface BookingWindow {
        /**
         * @after 2026-03-01T08:00:00.000-08:00
         * @before 2026-03-31T08:00:00.000-07:00
         * @displayName Booking Opens
         */
        opensAt: DateTime;

        /** @after 2026-04-01T00:00:00.000+02:00 */
        reminderAt: NullableDateTime;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const { jsonSchema, uiSchema } = generateSchemasOrThrow({
      filePath,
      typeName: "BookingWindow",
      extensionRegistry: createDateExtensionRegistry(),
      vendorPrefix: "x-formspec",
    });

    expect(jsonSchema.properties?.["opensAt"]).toEqual({
      type: "string",
      format: "date-time",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}(?:Z|[+-]\\d{2}:\\d{2})$",
      "x-formspec-date-time": true,
      "x-formspec-after": "2026-03-01T16:00:00.000Z",
      "x-formspec-before": "2026-03-31T15:00:00.000Z",
      title: "Booking Opens",
    });

    const reminderSchema = jsonSchema.properties?.["reminderAt"] as
      | NullableDateTimeSchema
      | undefined;
    expect(reminderSchema?.["x-formspec-after"]).toBe("2026-03-31T22:00:00.000Z");
    expect(reminderSchema?.$ref).toBe("#/$defs/NullableDateTime");
    expect(
      (jsonSchema.$defs?.["NullableDateTime"] as NullableDateTimeSchema | undefined)?.oneOf
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "string",
          format: "date-time",
          "x-formspec-date-time": true,
        }),
        expect.objectContaining({ type: "null" }),
      ])
    );

    expect(uiSchema).toEqual({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/opensAt", label: "Booking Opens" },
        { type: "Control", scope: "#/properties/reminderAt" },
      ],
    });
  });

  it("fails clearly for malformed date extension literals through the public generation path", () => {
    const filePath = writeTempSource(`
      export type DateTime = string;

      export interface InvalidWindow {
        /** @after 2026-03-01T16:00:00Z */
        opensAt: DateTime;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    expect(() =>
      generateSchemasOrThrow({
        filePath,
        typeName: "InvalidWindow",
        extensionRegistry: createDateExtensionRegistry(),
        vendorPrefix: "x-formspec",
      })
    ).toThrow(/exactly millisecond precision and an explicit timezone/);
  });

  it("allows a custom type override named Date without poisoning unrelated tag analysis", () => {
    const filePath = writeTempSource(`
      export interface BookingMetadata {
        createdAt: Date;

        /** @minLength 1 */
        label: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const { jsonSchema } = generateSchemasOrThrow({
      filePath,
      typeName: "BookingMetadata",
      extensionRegistry: createBuiltInDateRegistry(),
      vendorPrefix: "x-formspec",
    });

    expect(jsonSchema.properties?.["createdAt"]).toEqual({
      type: "string",
      format: "date-time",
      "x-formspec-date-object": true,
    });
    expect(jsonSchema.properties?.["label"]).toMatchObject({
      type: "string",
      minLength: 1,
    });
  });

  it("reports unsupported global built-in overrides as validation diagnostics", () => {
    const filePath = writeTempSource(`
      export interface UnsupportedArrayOverride {
        items: Array<string>;

        /**
         * @minLength 1
         * @maxLength 10
         */
        label: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const message = getThrownMessage(() =>
      generateSchemasOrThrow({
        filePath,
        typeName: "UnsupportedArrayOverride",
        extensionRegistry: createUnsupportedArrayRegistry(),
        vendorPrefix: "x-formspec",
      })
    );

    expect(message).toMatch(/UNSUPPORTED_CUSTOM_TYPE_OVERRIDE/);
    expect(message).not.toMatch(/TYPE_MISMATCH/);
    expect(message.match(/UNSUPPORTED_CUSTOM_TYPE_OVERRIDE/g)).toHaveLength(1);
  });

  it("returns unsupported global built-in overrides as structured diagnostics", () => {
    const filePath = writeTempSource(`
      export interface UnsupportedArrayOverrideDetailed {
        items: Array<string>;

        /** @minLength 1 */
        label: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const result = generateSchemas({
      filePath,
      typeName: "UnsupportedArrayOverrideDetailed",
      extensionRegistry: createUnsupportedArrayRegistry(),
      vendorPrefix: "x-formspec",
      errorReporting: "diagnostics",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toMatchObject([
      {
        code: "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE",
      },
    ]);
    // Phase 4 Slice C: setup diagnostics are now anchored at the extension
    // registration site (surface: "extension"), not at the tag use site.
    // No source location is available for the registry-level failure, so
    // provenance uses line 1, column 0.
    expect(result.diagnostics[0]?.primaryLocation).toEqual({
      surface: "extension",
      file: filePath,
      line: 1,
      column: 0,
    });
    expect(result.diagnostics[0]?.relatedLocations).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("TYPE_MISMATCH");
  });

  it("surfaces invalid custom type registrations as setup diagnostics", () => {
    const filePath = writeTempSource(`
      export interface InvalidCustomTypeRegistration {
        /**
         * @minLength 1
         * @maxLength 10
         */
        label: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const message = getThrownMessage(() =>
      generateSchemasOrThrow({
        filePath,
        typeName: "InvalidCustomTypeRegistration",
        extensionRegistry: createInvalidTypeNameRegistry(),
        vendorPrefix: "x-formspec",
      })
    );

    expect(message).toMatch(/SYNTHETIC_SETUP_FAILURE/);
    expect(message).toMatch(/Invalid custom type name "Not A Type"/);
    expect(message).not.toMatch(/TYPE_MISMATCH/);
    expect(message.match(/SYNTHETIC_SETUP_FAILURE/g)).toHaveLength(1);
    // Phase 4 Slice C: setup diagnostics are now anchored at the extension
    // registration site (surface: "extension", line 1, column 0), not at the
    // tag use site. The formatted location embedded in the thrown message is now
    // `:1:0` instead of the previous tag-site location.
    expect(message).toMatch(/:1:0\)/);
  });

  it("returns invalid custom type registrations as setup diagnostics without throwing", () => {
    const filePath = writeTempSource(`
      export interface InvalidCustomTypeRegistrationDetailed {
        /** @minLength 1 */
        label: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const result = generateSchemas({
      filePath,
      typeName: "InvalidCustomTypeRegistrationDetailed",
      extensionRegistry: createInvalidTypeNameRegistry(),
      vendorPrefix: "x-formspec",
      errorReporting: "diagnostics",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toMatchObject([
      {
        code: "SYNTHETIC_SETUP_FAILURE",
      },
    ]);
    expect(result.diagnostics[0]?.message).toMatch(/Invalid custom type name "Not A Type"/);
    // Phase 4 Slice C: setup diagnostics are now anchored at the extension
    // registration site (surface: "extension"), not at the tag use site.
    expect(result.diagnostics[0]?.primaryLocation).toEqual({
      surface: "extension",
      file: filePath,
      line: 1,
      column: 0,
    });
    expect(result.diagnostics[0]?.relatedLocations).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("TYPE_MISMATCH");
  });
});
