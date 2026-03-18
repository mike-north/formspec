/**
 * Tests for the codegen type generation functions (imported from @formspec/build).
 *
 * Comprehensive codegen tests are in @formspec/build.
 * This file verifies the CLI can access the codegen API.
 */

import { describe, it, expect } from "vitest";
import { generateCodegenOutput, type DecoratedClassInfo, type TypeMetadata } from "@formspec/build";

function createTypeMetadata(overrides: Partial<TypeMetadata> = {}): TypeMetadata {
  return {
    type: "string",
    ...overrides,
  };
}

function createDecoratedClassInfo(overrides: Partial<DecoratedClassInfo> = {}): DecoratedClassInfo {
  return {
    name: "TestForm",
    sourcePath: "./test-form",
    typeMetadata: {},
    isExported: true,
    ...overrides,
  };
}

describe("generateCodegenOutput (from @formspec/build)", () => {
  it("generates correct schema type for primitive fields", () => {
    const cls = createDecoratedClassInfo({
      name: "UserForm",
      typeMetadata: {
        name: createTypeMetadata({ type: "string" }),
        age: createTypeMetadata({ type: "number" }),
        active: createTypeMetadata({ type: "boolean" }),
      },
    });

    const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

    expect(output).toContain("export type UserFormSchema = {");
    expect(output).toContain("name: string;");
    expect(output).toContain("age: number;");
    expect(output).toContain("active: boolean;");
  });

  it("generates typed accessor function", () => {
    const cls = createDecoratedClassInfo({
      name: "UserForm",
      typeMetadata: {
        name: createTypeMetadata({ type: "string" }),
      },
    });

    const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

    expect(output).toContain("export function getUserFormFormSpec(): UserFormFormSpec {");
  });
});
