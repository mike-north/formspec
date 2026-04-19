/**
 * Tests that type arguments referencing large external types don't overflow
 * the stack during schema generation.
 *
 * Regression: Ref<Stripe.Customer> caused a stack overflow because
 * extractReferenceTypeArguments recursed into Customer's 100+ deeply
 * nested properties. The type argument is only used for naming and $defs
 * references — it doesn't need full property expansion.
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-large-type-arg-"));

  // A large external type with many properties (simulates Stripe.Customer)
  fs.writeFileSync(
    path.join(tmpDir, "large-type.ts"),
    [
      "export interface LargeType {",
      "  readonly object: 'large_thing';",
      ...Array.from({ length: 100 }, (_, i) => `  prop${i}: string;`),
      "}",
    ].join("\n")
  );

  // A generic wrapper type that references the large type as a type argument
  fs.writeFileSync(
    path.join(tmpDir, "wrapper.ts"),
    [
      'import type { LargeType } from "./large-type.js";',
      "",
      "type Wrapper<T extends { readonly object: string }> = {",
      "  id: string;",
      '  type: T["object"];',
      "};",
      "",
      "export interface Config {",
      "  ref: Wrapper<LargeType>;",
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

describe("large external type argument", () => {
  it("does not overflow the stack when a type argument is a large external type", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "wrapper.ts"),
      typeName: "Config",
    });

    // The build should complete without stack overflow. The wrapper's own
    // properties (id, type) should appear in the schema output.
    expect(result.jsonSchema).toBeDefined();
    expect(result.jsonSchema.properties).toBeDefined();
  });
});
