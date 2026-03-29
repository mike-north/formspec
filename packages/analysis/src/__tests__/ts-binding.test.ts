import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collectCompatiblePathTargets,
  getTypeSemanticCapabilities,
  resolveDeclarationPlacement,
  resolvePathTargetType,
} from "../index.js";
import { createProgram } from "./helpers.js";

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

    expect(resolveDeclarationPlacement(classDeclaration!)).toBe("class");
    expect(resolveDeclarationPlacement(property!)).toBe("class-field");
    expect(resolveDeclarationPlacement(method!)).toBe("class-method");
    expect(resolveDeclarationPlacement(methodParameter!)).toBe("method-parameter");
    expect(resolveDeclarationPlacement(functionDeclaration!)).toBe("function");
    expect(resolveDeclarationPlacement(functionParameter!)).toBe("function-parameter");
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

    expect(
      getTypeSemanticCapabilities(checker.getTypeFromTypeNode(amount!.type!), checker)
    ).toEqual(
      expect.arrayContaining(["numeric-comparable"])
    );
    expect(getTypeSemanticCapabilities(checker.getTypeFromTypeNode(tags!.type!), checker)).toEqual(
      expect.arrayContaining(["array-like", "json-like"])
    );
    expect(
      getTypeSemanticCapabilities(checker.getTypeFromTypeNode(status!.type!), checker)
    ).toEqual(
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
    const paymentType = checker.getTypeFromTypeNode(paymentDeclaration!.type!);

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
