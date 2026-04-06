import { describe, expect, it } from "vitest";
import { defineExtension, defineMetadataSlot } from "@formspec/core";
import * as ts from "typescript";
import {
  analyzeMetadataForNode,
  analyzeMetadataForSourceFile,
  sliceCommentSpan,
} from "../internal.js";
import { createProgram } from "./helpers.js";

function findInterface(sourceFile: ts.SourceFile, name: string): ts.InterfaceDeclaration {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name
  );
  if (declaration === undefined) {
    throw new Error(`Interface "${name}" not found`);
  }
  return declaration;
}

function findInterfaceProperty(
  declaration: ts.InterfaceDeclaration,
  name: string
): ts.PropertySignature {
  const property = declaration.members.find(
    (member): member is ts.PropertySignature =>
      ts.isPropertySignature(member) && ts.isIdentifier(member.name) && member.name.text === name
  );
  if (property === undefined) {
    throw new Error(`Property "${name}" not found`);
  }
  return property;
}

describe("metadata analysis", () => {
  it("resolves explicit and inferred built-in metadata for a declaration node", () => {
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        /** @apiName customer_name */
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
      metadata: {
        field: {
          displayName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) => `Label ${logicalName}`,
          },
        },
      },
    });

    expect(analysis?.logicalName).toBe("customerName");
    expect(analysis?.resolvedMetadata?.apiName).toEqual({
      value: "customer_name",
      source: "explicit",
    });
    expect(analysis?.resolvedMetadata?.displayName).toEqual({
      value: "Label customerName",
      source: "inferred",
    });
    expect(
      analysis?.entries.map((entry) => `${entry.slotId}:${entry.qualifier ?? "default"}`)
    ).toEqual(expect.arrayContaining(["apiName:default", "displayName:default"]));
  });

  it("treats :singular built-in metadata tags as the default resolved value", () => {
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        /** @apiName :singular customer_name */
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
    });
    const apiNameEntry = analysis?.entries.find((entry) => entry.slotId === "apiName");

    expect(apiNameEntry).toMatchObject({
      slotId: "apiName",
      value: "customer_name",
      source: "explicit",
    });
    expect(apiNameEntry?.qualifier).toBeUndefined();
    expect(analysis?.resolvedMetadata?.apiName).toEqual({
      value: "customer_name",
      source: "explicit",
    });
  });

  it("surfaces explicit source ranges for qualified metadata values", () => {
    const source = `
      export interface OrderItem {
        /** @displayName :plural Order Items */
        items: string[];
      }
    `;
    const { program, sourceFile } = createProgram(source);
    const declaration = findInterface(sourceFile, "OrderItem");
    const property = findInterfaceProperty(declaration, "items");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
    });
    const plural = analysis?.entries.find(
      (entry) => entry.slotId === "displayName" && entry.qualifier === "plural"
    );

    expect(plural?.source).toBe("explicit");
    expect(plural?.explicitSource?.form).toBe("qualified");
    expect(plural?.explicitSource?.qualifier).toBe("plural");
    expect(plural?.explicitSource?.fullRange).toBeDefined();
    expect(plural?.explicitSource?.tagNameRange).toBeDefined();
    expect(plural?.explicitSource?.valueRange).toBeDefined();
    expect(plural?.explicitSource?.qualifierRange).toBeDefined();

    const commentText = sourceFile.text.slice(
      property.getFullStart(),
      property.getStart(sourceFile)
    );
    expect(
      sliceCommentSpan(commentText, plural!.explicitSource!.fullRange!, {
        offset: property.getFullStart(),
      })
    ).toContain("@displayName :plural Order Items");
    expect(
      sliceCommentSpan(commentText, plural!.explicitSource!.tagNameRange!, {
        offset: property.getFullStart(),
      })
    ).toBe("@displayName");
    expect(
      sliceCommentSpan(commentText, plural!.explicitSource!.valueRange!, {
        offset: property.getFullStart(),
      })
    ).toBe("Order Items");
    expect(
      sliceCommentSpan(commentText, plural!.explicitSource!.qualifierRange!, {
        offset: property.getFullStart(),
      })
    ).toBe("plural");
  });

  it("supports extension-defined metadata slots during node and file analysis", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "externalName",
          declarationKinds: ["field"],
          qualifiers: [{ qualifier: "plural" }],
          inferValue: ({ logicalName }) => logicalName.toUpperCase(),
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface ProductRecord {
        /** @externalName :plural PRODUCTS */
        products: string[];
      }
    `);
    const declaration = findInterface(sourceFile, "ProductRecord");
    const property = findInterfaceProperty(declaration, "products");

    const nodeAnalysis = analyzeMetadataForNode({
      program,
      node: property,
      extensions: [extension],
    });
    const fileAnalysis = analyzeMetadataForSourceFile({
      program,
      sourceFile,
      extensions: [extension],
    });

    expect(nodeAnalysis?.applicableSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          tagName: "externalName",
          qualifiers: ["plural"],
        }),
      ])
    );
    expect(nodeAnalysis?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          value: "PRODUCTS",
          qualifier: "plural",
          source: "explicit",
        }),
        expect.objectContaining({
          slotId: "externalName",
          value: "PRODUCTS",
          source: "inferred",
        }),
      ])
    );
    expect(fileAnalysis.map((analysis) => analysis.logicalName)).toEqual(
      expect.arrayContaining(["ProductRecord", "products"])
    );
  });
});
