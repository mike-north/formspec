/**
 * Tests for generic wrapper types (like Ref<T>) with type arguments of
 * varying sizes and origins.
 *
 * Related: packages/build/src/__tests__/discriminator.test.ts:704 covers
 * a similar large-carrier scenario via @discriminator.
 *
 * Covers:
 *   1. External deeply-nested type argument — doesn't overflow the stack
 *      and doesn't leak into $defs (regression for Ref<Stripe.Customer>).
 *   2. External small type argument — same opaque-reference behavior.
 *   3. Same-file type argument — falls through to normal recursive resolution.
 *   4. Inline anonymous type argument — falls through to normal resolution.
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

  // Deeply nested type chain (simulates the deeply-recursive shape that caused
  // the original Ref<Stripe.Customer> overflow). Each type references the next,
  // so resolving one requires recursing through all ~300 declarations.
  const depth = 300;
  const lines: string[] = [];
  for (let d = 0; d < depth; d++) {
    lines.push(`export interface Type${String(d)} {`);
    lines.push(`  readonly object: 'type_${String(d)}';`);
    if (d + 1 < depth) lines.push(`  nested: Type${String(d + 1)};`);
    lines.push("}");
  }
  fs.writeFileSync(path.join(tmpDir, "deep-type.ts"), lines.join("\n"));

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

  // Fixture using small external type argument
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
      'import type { Type0 } from "./deep-type.js";',
      'import type { Wrapper } from "./wrapper.js";',
      "",
      "export interface DeepRefConfig {",
      "  ref: Wrapper<Type0>;",
      "}",
    ].join("\n")
  );

  // Fixture using same-file type argument (should resolve normally)
  fs.writeFileSync(
    path.join(tmpDir, "same-file-ref.ts"),
    [
      "type Wrapper<T extends { readonly object: string }> = {",
      "  id: string;",
      '  type: T["object"];',
      "};",
      "",
      "interface LocalType {",
      "  readonly object: 'local_thing';",
      "  extra: number;",
      "}",
      "",
      "export interface SameFileConfig {",
      "  ref: Wrapper<LocalType>;",
      "}",
    ].join("\n")
  );

  // Fixture using inline anonymous type argument (should resolve normally)
  fs.writeFileSync(
    path.join(tmpDir, "inline-ref.ts"),
    [
      "type Wrapper<T extends { readonly object: string }> = {",
      "  id: string;",
      '  type: T["object"];',
      "};",
      "",
      "export interface InlineConfig {",
      "  ref: Wrapper<{ readonly object: 'inline_thing' }>;",
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
  it("emits deeply-nested external type as opaque reference without recursing through the chain", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "deep-ref.ts"),
      typeName: "DeepRefConfig",
    });

    const defs = (result.jsonSchema.$defs ?? {}) as Record<string, unknown>;
    const props = result.jsonSchema.properties as Record<string, unknown>;
    expect(props["ref"]).toBeDefined();

    // Pre-fix, $defs would contain Type0 (and all nested Type1..Type299)
    // with their properties inlined — and the recursion caused a stack overflow.
    expect(defs).not.toHaveProperty("Type0");
    expect(defs).not.toHaveProperty("Type1");
  });

  it("emits small external type as opaque reference without inlining into $defs", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "small-ref.ts"),
      typeName: "SmallRefConfig",
    });

    const defs = (result.jsonSchema.$defs ?? {}) as Record<string, unknown>;
    const props = result.jsonSchema.properties as Record<string, unknown>;
    expect(props["ref"]).toBeDefined();

    // External type arguments are emitted as opaque references regardless
    // of size. SmallType should not appear in $defs.
    expect(defs).not.toHaveProperty("SmallType");
  });

  it("resolves same-file type argument normally (not opaque)", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "same-file-ref.ts"),
      typeName: "SameFileConfig",
    });

    const props = result.jsonSchema.properties as Record<string, unknown>;
    expect(props["ref"]).toBeDefined();
  });

  it("resolves inline anonymous type argument normally", () => {
    const result = generateSchemasOrThrow({
      filePath: path.join(tmpDir, "inline-ref.ts"),
      typeName: "InlineConfig",
    });

    const props = result.jsonSchema.properties as Record<string, unknown>;
    expect(props["ref"]).toBeDefined();
  });
});
