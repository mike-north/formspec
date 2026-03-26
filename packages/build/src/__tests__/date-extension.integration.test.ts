import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateSchemas } from "../index.js";
import {
  createDateExtensionRegistry,
  parseCanonicalDateTime,
} from "./fixtures/example-date-extension.js";

interface NullableDateTimeSchema {
  readonly $ref?: string;
  readonly oneOf?: readonly unknown[];
  readonly ["x-formspec-after"]?: unknown;
}

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-date-ext-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
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
    expect(() => parseCanonicalDateTime("2026-03-01T16:00:00.000")).toThrow(
      /explicit timezone/
    );
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

    const { jsonSchema, uiSchema } = generateSchemas({
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

    const reminderSchema = jsonSchema.properties?.["reminderAt"] as NullableDateTimeSchema | undefined;
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
      generateSchemas({
        filePath,
        typeName: "InvalidWindow",
        extensionRegistry: createDateExtensionRegistry(),
        vendorPrefix: "x-formspec",
      })
    ).toThrow(/exactly millisecond precision and an explicit timezone/);
  });
});
