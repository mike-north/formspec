/**
 * Tests for generic wrapper types (like Ref<T>) with type arguments of
 * varying sizes and origins.
 *
 * Covers:
 *   1. Small locally-defined type argument — resolves correctly with
 *      the wrapper's own properties preserved.
 *   2. Deeply nested external type argument — doesn't overflow the stack
 *      and doesn't leak into $defs.
 *      Regression: Ref<Stripe.Customer> caused a stack overflow because
 *      extractReferenceTypeArguments recursed into Customer's deeply
 *      nested property tree.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-type-arg-"));

  // Small type defined in a separate file
  fs.writeFileSync(
    path.join(tmpDir, "small-type.ts"),
    [
      "export interface SmallType {",
      "  readonly object: 'small_thing';",
      "}",
    ].join("\n")
  );

  // Deeply nested type chain (simulates Stripe.Customer's recursive depth).
  // Each level references the next, creating a chain that would reliably
  // overflow the stack if recursively expanded.
  const nestingDepth = 30;
  const nestedTypeLines: string[] = [
    "export interface Level0 {",
    "  readonly object: 'deep_thing';",
    "  name: string;",
    "  nested: Level1;",
    "}",
  ];
  for (let i = 1; i < nestingDepth; i++) {
    const next = i < nestingDepth - 1 ? `Level${String(i + 1)}` : "string";
    nestedTypeLines.push(
      `export interface Level${String(i)} {`,
      `  value${String(i)}: string;`,
      `  nested: ${next};`,
      "}",
    );
  }
  fs.writeFileSync(path.join(tmpDir, "deep-type.ts"), nestedTypeLines.join("\n"));

  // Generic wrapper (simulates Ref<T>)
  fs.writeFileSync(
    path.join(tmpDir, "wrapper.ts"),
    [
      "type Wrapper<T extends { readonly object: string }> = {",
      "  id: string;",
      '  type: T["object"];',
      "};",
      "",
      "export { type Wrapper };",
    ].join("\n")
  );

  // Fixture using small local type argument
  fs.writeFileSync(
    path.join(tmpDir, "small-ref.ts"),
    [
      'import type { SmallType } from "./small-type.js";',
      'import type { Wrapper } from "./wrapper.js";',
      "",
      "export interface SmallRefConfig {",
      "  ref: Wrapper<SmallType>;",
      "}",
    ].join("\n")
  );

  // Fixture using deeply nested external type argument
  fs.writeFileSync(
    path.join(tmpDir, "deep-ref.ts"),
    [
      'import type { Level0 } from "./deep-type.js";',
      'import type { Wrapper } from "./wrapper.js";',
      "",
      "export interface DeepRefConfig {",
      "  ref: Wrapper<Level0>;",
      "}",
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
        },
      },
      null,
      2
    )
  );
});

afterAll(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("generic wrapper type arguments", () => {
  it("resolves Wrapper<SmallType> with correct properties", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "small-ref.ts"),
      typeName: "SmallRefConfig",
    });

    const properties = result.jsonSchema.properties as Record<string, unknown>;
    expect(properties).toBeDefined();

    const refSchema = properties["ref"] as Record<string, unknown>;
    expect(refSchema).toBeDefined();
  });

  it("resolves Wrapper<Level0> without stack overflow and without leaking into $defs", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "deep-ref.ts"),
      typeName: "DeepRefConfig",
    });

    const properties = result.jsonSchema.properties as Record<string, unknown>;
    expect(properties).toBeDefined();

    const refSchema = properties["ref"] as Record<string, unknown>;
    expect(refSchema).toBeDefined();

    // The deeply nested external type argument must NOT be expanded into $defs
    const defs = result.jsonSchema.$defs ?? {};
    expect(defs).not.toHaveProperty("Level0");
    expect(defs).not.toHaveProperty("Level1");
  });
});
