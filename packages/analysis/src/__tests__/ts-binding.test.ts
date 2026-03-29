import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collectCompatiblePathTargets,
  getTypeSemanticCapabilities,
  resolveDeclarationPlacement,
  resolvePathTargetType,
} from "../index.js";
import { createProgram } from "./helpers.js";

function expectDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}

describe("ts-binding", () => {
  it("resolves placements for declarations and parameters", () => {
    const source = `
      class Foo {
        value!: number;
        method(input: string): void {}
      }

      function helper(flag: boolean): void {}
    `;
    const { sourceFile } = createProgram(source, "/virtual/placements.ts");
    const classDeclaration = sourceFile.statements.find(ts.isClassDeclaration);
    const functionDeclaration = sourceFile.statements.find(ts.isFunctionDeclaration);
    const property = classDeclaration?.members.find(ts.isPropertyDeclaration);
    const method = classDeclaration?.members.find(ts.isMethodDeclaration);
    const methodParameter = method?.parameters[0];
    const functionParameter = functionDeclaration?.parameters[0];

    expect(
      resolveDeclarationPlacement(expectDefined(classDeclaration, "Expected class declaration"))
    ).toBe("class");
    expect(
      resolveDeclarationPlacement(expectDefined(property, "Expected property declaration"))
    ).toBe("class-field");
    expect(resolveDeclarationPlacement(expectDefined(method, "Expected method declaration"))).toBe(
      "class-method"
    );
    expect(
      resolveDeclarationPlacement(expectDefined(methodParameter, "Expected method parameter"))
    ).toBe("method-parameter");
    expect(
      resolveDeclarationPlacement(
        expectDefined(functionDeclaration, "Expected function declaration")
      )
    ).toBe("function");
    expect(
      resolveDeclarationPlacement(expectDefined(functionParameter, "Expected function parameter"))
    ).toBe("function-parameter");
  });

  it("derives semantic capabilities from TypeScript types", () => {
    const source = `
      type Status = "draft" | "sent";
      interface Payload {
        amount: number;
        tags: string[];
        status: Status;
      }
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/capabilities.ts");
    const payload = sourceFile.statements.find(ts.isInterfaceDeclaration);
    const amount = payload?.members.find(
      (member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) && member.name.getText(sourceFile) === "amount"
    );
    const tags = payload?.members.find(
      (member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) && member.name.getText(sourceFile) === "tags"
    );
    const status = payload?.members.find(
      (member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) && member.name.getText(sourceFile) === "status"
    );

    const amountType = expectDefined(amount?.type, "Expected amount type annotation");
    const tagsType = expectDefined(tags?.type, "Expected tags type annotation");
    const statusType = expectDefined(status?.type, "Expected status type annotation");

    expect(getTypeSemanticCapabilities(checker.getTypeFromTypeNode(amountType), checker)).toEqual(
      expect.arrayContaining(["numeric-comparable"])
    );
    expect(getTypeSemanticCapabilities(checker.getTypeFromTypeNode(tagsType), checker)).toEqual(
      expect.arrayContaining(["array-like", "json-like"])
    );
    expect(getTypeSemanticCapabilities(checker.getTypeFromTypeNode(statusType), checker)).toEqual(
      expect.arrayContaining(["string-like", "enum-member-addressable"])
    );
  });

  it("collects compatible path targets and resolves dotted path types", () => {
    const source = `
      declare const payment: {
        amount: number;
        nested: {
          value: number;
          label: string;
        };
        label: string;
      };
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/path-targets.ts");
    const payment = sourceFile.statements.find(ts.isVariableStatement);
    const paymentDeclaration = payment?.declarationList.declarations[0];
    const paymentTypeNode = expectDefined(
      paymentDeclaration?.type,
      "Expected payment type annotation"
    );
    const paymentType = checker.getTypeFromTypeNode(paymentTypeNode);

    expect(collectCompatiblePathTargets(paymentType, checker, "numeric-comparable")).toEqual(
      expect.arrayContaining(["amount"])
    );
    expect(collectCompatiblePathTargets(paymentType, checker, "numeric-comparable")).not.toContain(
      "label"
    );

    const resolved = resolvePathTargetType(paymentType, checker, ["nested", "value"]);
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") {
      throw new Error(`Expected path to resolve`);
    }
    expect(checker.typeToString(resolved.type)).toBe("number");
    expect(resolvePathTargetType(paymentType, checker, ["nested", "missing"])).toEqual({
      kind: "missing-property",
      segment: "missing",
    });
  });
});
