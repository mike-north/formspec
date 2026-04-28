/**
 * Tests for TypeScript-backed field type classification helpers.
 */

import * as ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getFieldTypeCategory,
  isBigIntType,
  isBooleanType,
  isNullableType,
  isNumberType,
  isStringType,
} from "../../src/utils/type-utils.js";

const fixtureFileName = "/type-utils-fixture.ts";

const fixtureSource = `
declare const __integerBrand: unique symbol;
declare const __emailBrand: unique symbol;
declare const __amountBrand: unique symbol;
declare const __flagBrand: unique symbol;

type Integer = number & { readonly [__integerBrand]: true };
type Email = string & { readonly [__emailBrand]: true };
type Amount = bigint & { readonly [__amountBrand]: true };
type Flag = boolean & { readonly [__flagBrand]: true };

interface Fixture {
  text: string;
  textLiteral: "draft";
  count: number;
  countLiteral: 42;
  brandedCount: Integer;
  big: bigint;
  bigLiteral: 42n;
  brandedBig: Amount;
  enabled: boolean;
  enabledLiteral: true;
  brandedEnabled: Flag;
  brandedText: Email;
  maybeText: string | null;
  maybeCount: number | undefined;
  maybeBrandedText: Email | null;
  maybeBrandedCount: Integer | undefined;
  maybeBrandedBig: Amount | null;
  nested: { id: string };
  mixed: string | number;
}
`;

interface FixtureProgram {
  checker: ts.TypeChecker;
  typeOf: (propertyName: string) => ts.Type;
}

function createFixtureProgram(): FixtureProgram {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const host = ts.createCompilerHost(compilerOptions);
  const originalFileExists = host.fileExists.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);

  host.fileExists = (fileName) => fileName === fixtureFileName || originalFileExists(fileName);
  host.readFile = (fileName) =>
    fileName === fixtureFileName ? fixtureSource : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (fileName === fixtureFileName) {
      return ts.createSourceFile(fileName, fixtureSource, languageVersion, true);
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram([fixtureFileName], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
  ).toEqual([]);

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(fixtureFileName);
  if (!sourceFile) {
    throw new Error("Expected fixture source file to be present in test program.");
  }

  const fixture = sourceFile.statements.find(ts.isInterfaceDeclaration);
  if (!fixture) {
    throw new Error("Expected Fixture interface declaration in test program.");
  }

  const properties = new Map(
    fixture.members
      .filter(ts.isPropertySignature)
      .map((member) => [member.name.getText(sourceFile), member] as const)
  );

  return {
    checker,
    typeOf(propertyName) {
      const property = properties.get(propertyName);
      if (!property?.type) {
        throw new Error(`Expected property "${propertyName}" to have an explicit type.`);
      }
      return checker.getTypeAtLocation(property.type);
    },
  };
}

describe("type-utils", () => {
  let fixture: FixtureProgram | null = null;

  beforeAll(() => {
    fixture = createFixtureProgram();
  });

  function getFixture(): FixtureProgram {
    if (fixture === null) {
      throw new Error("Expected type-utils fixture to be initialized before tests run.");
    }
    return fixture;
  }

  it("recognizes primitive and literal scalar types", () => {
    const fixture = getFixture();

    expect(isStringType(fixture.typeOf("text"), fixture.checker)).toBe(true);
    expect(isStringType(fixture.typeOf("textLiteral"), fixture.checker)).toBe(true);
    expect(isStringType(fixture.typeOf("brandedText"), fixture.checker)).toBe(true);

    expect(isNumberType(fixture.typeOf("count"), fixture.checker)).toBe(true);
    expect(isNumberType(fixture.typeOf("countLiteral"), fixture.checker)).toBe(true);
    expect(isNumberType(fixture.typeOf("brandedCount"), fixture.checker)).toBe(true);

    expect(isBigIntType(fixture.typeOf("big"))).toBe(true);
    expect(isBigIntType(fixture.typeOf("bigLiteral"))).toBe(true);
    expect(isBigIntType(fixture.typeOf("brandedBig"))).toBe(true);

    expect(isBooleanType(fixture.typeOf("enabled"), fixture.checker)).toBe(true);
    expect(isBooleanType(fixture.typeOf("enabledLiteral"), fixture.checker)).toBe(true);
    expect(isBooleanType(fixture.typeOf("brandedEnabled"), fixture.checker)).toBe(true);
  });

  it("rejects neighboring scalar types", () => {
    const fixture = getFixture();

    expect(isStringType(fixture.typeOf("count"), fixture.checker)).toBe(false);
    expect(isNumberType(fixture.typeOf("enabled"), fixture.checker)).toBe(false);
    expect(isBigIntType(fixture.typeOf("count"))).toBe(false);
    expect(isBooleanType(fixture.typeOf("text"), fixture.checker)).toBe(false);
  });

  it("recognizes nullish union members", () => {
    const fixture = getFixture();

    expect(isNullableType(fixture.typeOf("maybeText"))).toBe(true);
    expect(isNullableType(fixture.typeOf("maybeCount"))).toBe(true);
    expect(isNullableType(fixture.typeOf("text"))).toBe(false);
  });

  it("categorizes fields after removing nullish union members", () => {
    const fixture = getFixture();

    expect(getFieldTypeCategory(fixture.typeOf("maybeText"), fixture.checker)).toBe("string");
    expect(getFieldTypeCategory(fixture.typeOf("maybeCount"), fixture.checker)).toBe("number");
    expect(getFieldTypeCategory(fixture.typeOf("maybeBrandedText"), fixture.checker)).toBe(
      "string"
    );
    expect(getFieldTypeCategory(fixture.typeOf("maybeBrandedCount"), fixture.checker)).toBe(
      "number"
    );
    expect(getFieldTypeCategory(fixture.typeOf("maybeBrandedBig"), fixture.checker)).toBe(
      "bigint"
    );
    expect(getFieldTypeCategory(fixture.typeOf("brandedEnabled"), fixture.checker)).toBe(
      "boolean"
    );
    expect(getFieldTypeCategory(fixture.typeOf("nested"), fixture.checker)).toBe("object");
    expect(getFieldTypeCategory(fixture.typeOf("mixed"), fixture.checker)).toBe("union");
  });
});
