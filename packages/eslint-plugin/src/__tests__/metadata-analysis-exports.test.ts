import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import tsParser from "@typescript-eslint/parser";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { analyzeMetadataForNode as analyzeMetadataForNodeFromPlugin } from "../index.js";
import { analyzeMetadataForNode as analyzeMetadataForNodeFromBase } from "../base.js";

function findPropertyDefinition(ast: TSESTree.Program): TSESTree.PropertyDefinition {
  for (const statement of ast.body) {
    const declaration =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement;
    if (declaration?.type !== AST_NODE_TYPES.ClassDeclaration) {
      continue;
    }

    for (const member of declaration.body.body) {
      if (member.type === AST_NODE_TYPES.PropertyDefinition) {
        return member;
      }
    }
  }

  throw new Error("Expected class property definition");
}

describe("@formspec/eslint-plugin metadata analysis exports", () => {
  let tmpDir: string;
  let filePath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(os.tmpdir(), "formspec-metadata-analysis-"));
    filePath = join(tmpDir, "model.ts");
    writeFileSync(
      join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: "ES2022",
        },
      })
    );
    writeFileSync(
      filePath,
      [
        "export class CustomerModel {",
        "  /** @apiName customer_name @displayName Customer Name */",
        "  customerName!: string;",
        "}",
        "",
      ].join("\n")
    );
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("analyzes metadata from parser services through both public entry points", () => {
    const sourceText = [
      "export class CustomerModel {",
      "  /** @apiName customer_name @displayName Customer Name */",
      "  customerName!: string;",
      "}",
      "",
    ].join("\n");
    const parsed = tsParser.parseForESLint(sourceText, {
      filePath,
      projectService: true,
      tsconfigRootDir: tmpDir,
    });
    const services = parsed.services;
    expect(services.program).toBeDefined();

    const propertyNode = findPropertyDefinition(parsed.ast);
    const tsNode = services.esTreeNodeToTSNodeMap.get(propertyNode);
    expect(tsNode).toBeDefined();
    const getTypeCheckerSpy = vi.spyOn(services.program, "getTypeChecker");

    const rootResult = analyzeMetadataForNodeFromPlugin({
      program: services.program,
      node: tsNode!,
    });
    const baseResult = analyzeMetadataForNodeFromBase({
      program: services.program,
      node: tsNode!,
    });

    expect(rootResult).toEqual(baseResult);
    expect(getTypeCheckerSpy).toHaveBeenCalledTimes(2);
    expect(rootResult).toMatchObject({
      declarationKind: "field",
      logicalName: "customerName",
      resolvedMetadata: {
        apiName: { value: "customer_name", source: "explicit" },
        displayName: { value: "Customer Name", source: "explicit" },
      },
    });
  });
});
