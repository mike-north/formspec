/**
 * Tests for the `extractPayload` callback on custom type registrations.
 *
 * Verifies that:
 *   1. `extractPayload` is called during type analysis and its return value
 *      flows through to `toJsonSchema` as the `payload` argument.
 *   2. The callback receives the TypeScript type and checker, enabling
 *      extraction of type-level information (e.g., generic argument literals).
 *   3. Optional (nullable) fields pass the union type correctly.
 *   4. Errors thrown by the callback are attributed to the extension.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
import { defineCustomType, defineExtension } from "@formspec/core/internals";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";
import { createExtensionRegistry } from "../extensions/index.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-extract-payload-"));
});

afterAll(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writeFixture(name: string, lines: string[]): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, lines.join("\n"));
  return filePath;
}

describe("extractPayload", () => {
  it("passes extracted payload through to toJsonSchema", () => {
    const toJsonSchema = vi.fn(
      (payload: unknown, _vendorPrefix: string) => ({
        type: "string",
        "x-ref-target": payload,
      })
    );

    const registry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-test/ref",
        types: [
          defineCustomType({
            typeName: "TestRef",
            tsTypeNames: ["TestRef"],
            extractPayload: (type: unknown, checker: unknown) => {
              const tsType = type as ts.Type;
              const tsChecker = checker as ts.TypeChecker;
              const prop = tsType.getProperty("target");
              if (!prop) return null;
              const propType = tsChecker.getTypeOfSymbol(prop);
              return propType.isStringLiteral() ? propType.value : null;
            },
            toJsonSchema,
          }),
        ],
      }),
    ]);

    const filePath = writeFixture("extract-payload-basic.ts", [
      "type TestRef<T extends string> = {",
      "  id: string;",
      "  target: T;",
      "};",
      "",
      "export interface Config {",
      '  ref: TestRef<"customer">;',
      "}",
    ]);

    const { jsonSchema } = generateSchemasOrThrow({
      filePath,
      typeName: "Config",
      extensionRegistry: registry,
    });

    // Verify the payload reached toJsonSchema
    expect(toJsonSchema).toHaveBeenCalledWith("customer", expect.any(String));

    const props = jsonSchema.properties ?? {};
    expect(props.ref).toMatchObject({
      type: "string",
      "x-ref-target": "customer",
    });
  });

  it("passes null payload when extractPayload is not defined", () => {
    const toJsonSchema = vi.fn(
      (_payload: unknown, _vendorPrefix: string) => ({
        type: "string",
      })
    );

    const registry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-test/no-payload",
        types: [
          defineCustomType({
            typeName: "NoPayload",
            tsTypeNames: ["NoPayload"],
            toJsonSchema,
          }),
        ],
      }),
    ]);

    const filePath = writeFixture("extract-payload-none.ts", [
      "type NoPayload = string & { readonly __brand: true };",
      "",
      "export interface Config {",
      "  value: NoPayload;",
      "}",
    ]);

    generateSchemasOrThrow({
      filePath,
      typeName: "Config",
      extensionRegistry: registry,
    });

    expect(toJsonSchema).toHaveBeenCalledWith(null, expect.any(String));
  });

  it("handles optional fields by passing the union type to extractPayload", () => {
    const extractPayload = vi.fn((type: unknown, checker: unknown) => {
      let resolved = type as ts.Type;
      const tsChecker = checker as ts.TypeChecker;

      if (resolved.isUnion()) {
        const nonNullish = resolved.types.filter(
          (m) => !(m.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
        );
        if (nonNullish.length === 1 && nonNullish[0] !== undefined) {
          resolved = nonNullish[0];
        }
      }

      const prop = resolved.getProperty("target");
      if (!prop) return null;
      const propType = tsChecker.getTypeOfSymbol(prop);
      return propType.isStringLiteral() ? propType.value : null;
    });

    const registry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-test/optional-ref",
        types: [
          defineCustomType({
            typeName: "OptRef",
            tsTypeNames: ["OptRef"],
            extractPayload,
            toJsonSchema: (payload, _vendorPrefix) => ({
              type: "string",
              "x-target": payload,
            }),
          }),
        ],
      }),
    ]);

    const filePath = writeFixture("extract-payload-optional.ts", [
      "type OptRef<T extends string> = {",
      "  id: string;",
      "  target: T;",
      "};",
      "",
      "export interface Config {",
      '  optional?: OptRef<"invoice">;',
      "}",
    ]);

    const { jsonSchema } = generateSchemasOrThrow({
      filePath,
      typeName: "Config",
      extensionRegistry: registry,
    });

    expect(extractPayload).toHaveBeenCalled();

    const props = jsonSchema.properties ?? {};
    expect(props.optional).toMatchObject({
      type: "string",
      "x-target": "invoice",
    });
  });

  it("attributes errors from extractPayload to the extension", () => {
    const registry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-test/throwing",
        types: [
          defineCustomType({
            typeName: "Throwing",
            tsTypeNames: ["Throwing"],
            extractPayload: () => {
              throw new Error("kaboom");
            },
            toJsonSchema: () => ({ type: "string" }),
          }),
        ],
      }),
    ]);

    const filePath = writeFixture("extract-payload-throwing.ts", [
      "type Throwing = string & { readonly __brand: true };",
      "",
      "export interface Config {",
      "  value: Throwing;",
      "}",
    ]);

    expect(() =>
      generateSchemasOrThrow({
        filePath,
        typeName: "Config",
        extensionRegistry: registry,
      })
    ).toThrow(/extractPayload for custom type "Throwing" in extension "x-test\/throwing" threw/);
  });

  it("coerces undefined return to null", () => {
    const toJsonSchema = vi.fn(
      (_payload: unknown, _vendorPrefix: string) => ({
        type: "string",
      })
    );

    const registry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-test/undef-return",
        types: [
          defineCustomType({
            typeName: "UndefReturn",
            tsTypeNames: ["UndefReturn"],
            extractPayload: () => undefined as never,
            toJsonSchema,
          }),
        ],
      }),
    ]);

    const filePath = writeFixture("extract-payload-undef.ts", [
      "type UndefReturn = string & { readonly __brand: true };",
      "",
      "export interface Config {",
      "  value: UndefReturn;",
      "}",
    ]);

    generateSchemasOrThrow({
      filePath,
      typeName: "Config",
      extensionRegistry: registry,
    });

    expect(toJsonSchema).toHaveBeenCalledWith(null, expect.any(String));
  });
});
