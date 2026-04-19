/**
 * Regression test: `noUncheckedIndexedAccess` compatibility.
 *
 * When a project tsconfig enables `noUncheckedIndexedAccess: true`,
 * the synthetic type checker must still correctly validate constraint
 * tag arguments on fields of interfaces/classes.
 *
 * This reproduces a bug where constraint tags like `@minLength 1`
 * produced TYPE_MISMATCH errors when the host project's tsconfig
 * had `noUncheckedIndexedAccess: true`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas } from "../generators/class-schema.js";

describe("generateSchemas with noUncheckedIndexedAccess", () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-nounchecked-"));

    // Write a tsconfig with noUncheckedIndexedAccess: true
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "nodenext",
            strict: true,
            noUncheckedIndexedAccess: true,
            skipLibCheck: true,
          },
        },
        null,
        2
      )
    );

    // Write a fixture with constraint tags
    fixturePath = path.join(tmpDir, "config.ts");
    fs.writeFileSync(
      fixturePath,
      [
        "export interface Config {",
        "  /**",
        "   * A name field",
        "   * @displayName Name",
        "   * @minLength 1",
        "   * @maxLength 80",
        "   */",
        "  name: string;",
        "",
        "  /** @minimum 0 @maximum 100 */",
        "  score: number;",
        "",
        "  /** @displayName Active */",
        "  active: boolean;",
        "}",
      ].join("\n")
    );
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not produce TYPE_MISMATCH on string constraints", () => {
    const result = generateSchemas({ filePath: fixturePath, typeName: "Config" });
    expect(result.jsonSchema.properties).toMatchObject({
      name: { type: "string", minLength: 1, maxLength: 80, title: "Name" },
    });
  });

  it("does not produce TYPE_MISMATCH on numeric constraints", () => {
    const result = generateSchemas({ filePath: fixturePath, typeName: "Config" });
    expect(result.jsonSchema.properties).toMatchObject({
      score: { type: "number", minimum: 0, maximum: 100 },
    });
  });
});

describe("generateSchemas with noUncheckedIndexedAccess + Record<string, unknown>", () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-nounchecked-record-"));

    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "nodenext",
            strict: true,
            noUncheckedIndexedAccess: true,
            skipLibCheck: true,
          },
        },
        null,
        2
      )
    );

    fixturePath = path.join(tmpDir, "config.ts");
    fs.writeFileSync(
      fixturePath,
      [
        "export interface Config extends Record<string, unknown> {",
        "  /**",
        "   * A name field",
        "   * @displayName Name",
        "   * @minLength 1",
        "   * @maxLength 80",
        "   */",
        "  name: string;",
        "",
        "  /** @minimum 0 @maximum 100 */",
        "  score: number;",
        "",
        "  /** @displayName Active */",
        "  active: boolean;",
        "}",
      ].join("\n")
    );
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not produce TYPE_MISMATCH on string constraints with Record base", () => {
    const result = generateSchemas({ filePath: fixturePath, typeName: "Config" });
    expect(result.jsonSchema.properties).toMatchObject({
      name: { type: "string", minLength: 1, maxLength: 80, title: "Name" },
    });
  });

  it("does not produce TYPE_MISMATCH on numeric constraints with Record base", () => {
    const result = generateSchemas({ filePath: fixturePath, typeName: "Config" });
    expect(result.jsonSchema.properties).toMatchObject({
      score: { type: "number", minimum: 0, maximum: 100 },
    });
  });
});

describe("generateSchemas with noUncheckedIndexedAccess + cross-module imports", () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-nounchecked-xmod-"));

    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "nodenext",
            strict: true,
            noUncheckedIndexedAccess: true,
            skipLibCheck: true,
          },
        },
        null,
        2
      )
    );

    // Write a module that defines an interface with generics
    fs.writeFileSync(
      path.join(tmpDir, "sdk-types.ts"),
      [
        "export interface Calculation<C extends Record<string, unknown>> {",
        "  compute(config: C): void;",
        "}",
      ].join("\n")
    );

    // Write the config + implementation file
    fixturePath = path.join(tmpDir, "config.ts");
    fs.writeFileSync(
      fixturePath,
      [
        'import type { Calculation } from "./sdk-types.js";',
        "",
        "export interface Config extends Record<string, unknown> {",
        "  /**",
        "   * A name field",
        "   * @displayName Name",
        "   * @minLength 1",
        "   * @maxLength 80",
        "   */",
        "  name: string;",
        "",
        "  /** @minimum 0 @maximum 100 */",
        "  score: number;",
        "}",
        "",
        "export class MyCalc implements Calculation<Config> {",
        "  compute(_config: Config): void {}",
        "}",
      ].join("\n")
    );
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not produce TYPE_MISMATCH on string constraints with cross-module generics", () => {
    const result = generateSchemas({ filePath: fixturePath, typeName: "Config" });
    expect(result.jsonSchema.properties).toMatchObject({
      name: { type: "string", minLength: 1, maxLength: 80, title: "Name" },
    });
  });

  it("does not produce TYPE_MISMATCH on numeric constraints with cross-module generics", () => {
    const result = generateSchemas({ filePath: fixturePath, typeName: "Config" });
    expect(result.jsonSchema.properties).toMatchObject({
      score: { type: "number", minimum: 0, maximum: 100 },
    });
  });
});
