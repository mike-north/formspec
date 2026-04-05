import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  findDeclarationForCommentOffset,
  getDeclarationTypeParameterNames,
  getDirectPropertyTargets,
  getLastLeadingDocCommentRange,
  getVisibleTypeParameterNames,
} from "../source-bindings.js";
import { createProgram } from "./helpers.js";

function expectDefined<T>(value: T | undefined | null, message: string): T {
  if (value == null) {
    throw new Error(message);
  }

  return value;
}

describe("source-bindings", () => {
  it("returns declaration-local type parameter names for supported declarations", () => {
    const source = `
      class Box<TItem, TMeta> {
        method<TResult>(value: TResult): void {}
      }

      interface Pair<TLeft, TRight> {}

      type Tagged<TKind> = {
        kind: TKind;
      };

      function wrap<TInput, TOutput>(value: TInput): TOutput {
        throw new Error("unused");
      }
    `;
    const { sourceFile } = createProgram(source, "/virtual/source-bindings-locals.ts");
    const classDeclaration = expectDefined(
      sourceFile.statements.find(ts.isClassDeclaration),
      "Expected class declaration"
    );
    const methodDeclaration = expectDefined(
      classDeclaration.members.find(ts.isMethodDeclaration),
      "Expected method declaration"
    );
    const interfaceDeclaration = expectDefined(
      sourceFile.statements.find(ts.isInterfaceDeclaration),
      "Expected interface declaration"
    );
    const typeAliasDeclaration = expectDefined(
      sourceFile.statements.find(ts.isTypeAliasDeclaration),
      "Expected type alias declaration"
    );
    const functionDeclaration = expectDefined(
      sourceFile.statements.find(ts.isFunctionDeclaration),
      "Expected function declaration"
    );

    expect(getDeclarationTypeParameterNames(classDeclaration)).toEqual(["TItem", "TMeta"]);
    expect(getDeclarationTypeParameterNames(methodDeclaration)).toEqual(["TResult"]);
    expect(getDeclarationTypeParameterNames(interfaceDeclaration)).toEqual(["TLeft", "TRight"]);
    expect(getDeclarationTypeParameterNames(typeAliasDeclaration)).toEqual(["TKind"]);
    expect(getDeclarationTypeParameterNames(functionDeclaration)).toEqual(["TInput", "TOutput"]);
    expect(getDeclarationTypeParameterNames(sourceFile)).toEqual([]);
  });

  it("returns visible type parameters from enclosing lexical scopes", () => {
    const source = `
      class Container<TOuter> {
        method<TInner>(value: TInner): [TOuter, TInner] {
          return [undefined as unknown as TOuter, value];
        }
      }
    `;
    const { sourceFile } = createProgram(source, "/virtual/source-bindings-visible.ts");
    const classDeclaration = expectDefined(
      sourceFile.statements.find(ts.isClassDeclaration),
      "Expected class declaration"
    );
    const methodDeclaration = expectDefined(
      classDeclaration.members.find(ts.isMethodDeclaration),
      "Expected method declaration"
    );
    const parameterDeclaration = expectDefined(
      methodDeclaration.parameters[0],
      "Expected method parameter"
    );

    expect(getVisibleTypeParameterNames(methodDeclaration)).toEqual(["TInner", "TOuter"]);
    expect(getVisibleTypeParameterNames(parameterDeclaration)).toEqual(["TInner", "TOuter"]);
  });

  it("collects only direct identifier-named property targets", () => {
    const source = `
      class Example {
        required!: string;
        optional?: number;
        ["computed"]!: boolean;
        #secret = "hidden";
      }

      interface Contract {
        status: "draft";
        "display-name": string;
        nested: { amount: number };
      }

      type AliasShape = {
        kind: string;
        label?: string;
        42: boolean;
      };

      type PrimitiveAlias = string;
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/source-bindings-targets.ts");
    const classDeclaration = expectDefined(
      sourceFile.statements.find(ts.isClassDeclaration),
      "Expected class declaration"
    );
    const interfaceDeclaration = expectDefined(
      sourceFile.statements.find(ts.isInterfaceDeclaration),
      "Expected interface declaration"
    );
    const typeAliasDeclarations = sourceFile.statements.filter(ts.isTypeAliasDeclaration);
    const objectAliasDeclaration = expectDefined(
      typeAliasDeclarations.find((declaration) => declaration.name.text === "AliasShape"),
      "Expected object type alias declaration"
    );
    const primitiveAliasDeclaration = expectDefined(
      typeAliasDeclarations.find((declaration) => declaration.name.text === "PrimitiveAlias"),
      "Expected primitive type alias declaration"
    );

    expect(
      getDirectPropertyTargets(classDeclaration, checker).map((target) => ({
        name: target.name,
        optional: target.optional,
        type: checker.typeToString(target.type),
      }))
    ).toEqual([
      { name: "required", optional: false, type: "string" },
      { name: "optional", optional: true, type: "number | undefined" },
    ]);

    expect(
      getDirectPropertyTargets(interfaceDeclaration, checker).map((target) => ({
        name: target.name,
        optional: target.optional,
        type: checker.typeToString(target.type),
      }))
    ).toEqual([
      { name: "status", optional: false, type: '"draft"' },
      { name: "nested", optional: false, type: "{ amount: number; }" },
    ]);

    expect(
      getDirectPropertyTargets(objectAliasDeclaration, checker).map((target) => ({
        name: target.name,
        optional: target.optional,
        type: checker.typeToString(target.type),
      }))
    ).toEqual([
      { name: "kind", optional: false, type: "string" },
      { name: "label", optional: true, type: "string | undefined" },
    ]);

    expect(getDirectPropertyTargets(primitiveAliasDeclaration, checker)).toEqual([]);
  });

  it("binds doc comment offsets to the smallest matching declaration", () => {
    const source = `
      /** Container docs */
      class Container {
        /** Value docs */
        value!: string;
      }
    `;
    const { sourceFile } = createProgram(source, "/virtual/source-bindings-comments.ts");
    const classDeclaration = expectDefined(
      sourceFile.statements.find(ts.isClassDeclaration),
      "Expected class declaration"
    );
    const propertyDeclaration = expectDefined(
      classDeclaration.members.find(ts.isPropertyDeclaration),
      "Expected property declaration"
    );
    const classCommentRange = expectDefined(
      getLastLeadingDocCommentRange(classDeclaration, sourceFile),
      "Expected class doc comment range"
    );
    const propertyCommentRange = expectDefined(
      getLastLeadingDocCommentRange(propertyDeclaration, sourceFile),
      "Expected property doc comment range"
    );

    expect(findDeclarationForCommentOffset(sourceFile, classCommentRange.pos + 4)).toBe(
      classDeclaration
    );
    expect(findDeclarationForCommentOffset(sourceFile, propertyCommentRange.pos + 4)).toBe(
      propertyDeclaration
    );
    expect(findDeclarationForCommentOffset(sourceFile, source.indexOf("value!: string;"))).toBe(
      null
    );
  });
});
