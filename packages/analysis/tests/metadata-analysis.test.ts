import { describe, expect, it } from "vitest";
import { defineConstraintTag, defineExtension, defineMetadataSlot } from "@formspec/core";
import * as ts from "typescript";
import {
  analyzeMetadataForNode,
  analyzeMetadataForSourceFile,
  analyzeMetadataForNodeWithChecker,
  sliceCommentSpan,
} from "../src/internal.js";
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

  it("treats @apiName mid-prose as a real tag per TSDoc semantics (issue #424)", () => {
    const { program, sourceFile } = createProgram(`
      export interface MyRecord {
        /**
         * Field with @apiName override mentioned in prose.
         * @apiName actual_name
         */
        myField: string;
      }
    `);
    const declaration = findInterface(sourceFile, "MyRecord");
    const property = findInterfaceProperty(declaration, "myField");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
      metadata: {},
    });

    // TSDoc treats @apiName mid-prose as a block tag — first occurrence wins.
    // The value is everything from @apiName to the end of the line.
    expect(analysis?.resolvedMetadata?.apiName).toEqual({
      value: "override mentioned in prose.",
      source: "explicit",
    });
  });

  it("honors an internal logical-name override for inferred metadata", () => {
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    const analysis = analyzeMetadataForNodeWithChecker({
      program,
      checker: program.getTypeChecker(),
      node: property,
      logicalName: "customerName<string>",
      metadata: {
        field: {
          displayName: {
            mode: "infer-if-missing",
            infer: ({ logicalName }) => `Label ${logicalName}`,
          },
        },
      },
    });

    expect(analysis?.logicalName).toBe("customerName<string>");
    expect(analysis?.resolvedMetadata?.displayName).toEqual({
      value: "Label customerName<string>",
      source: "inferred",
    });
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

    if (plural?.explicitSource === undefined) {
      throw new Error("Expected explicit source ranges for plural displayName");
    }

    const { explicitSource } = plural;

    const commentText = sourceFile.text.slice(
      property.getFullStart(),
      property.getStart(sourceFile)
    );
    expect(
      sliceCommentSpan(commentText, explicitSource.fullRange, {
        offset: property.getFullStart(),
      })
    ).toContain("@displayName :plural Order Items");
    expect(
      sliceCommentSpan(commentText, explicitSource.tagNameRange, {
        offset: property.getFullStart(),
      })
    ).toBe("@displayName");
    expect(
      sliceCommentSpan(commentText, explicitSource.valueRange, {
        offset: property.getFullStart(),
      })
    ).toBe("Order Items");
    const qualifierRange = explicitSource.qualifierRange;
    if (qualifierRange === undefined) throw new Error("qualifierRange defined above via toBeDefined()");
    expect(
      sliceCommentSpan(commentText, qualifierRange, {
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

  it("does not treat undeclared :singular qualifiers as extension metadata aliases", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "externalName",
          declarationKinds: ["field"],
          qualifiers: [{ qualifier: "plural" }],
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface ProductRecord {
        /** @externalName :singular PRODUCTS */
        products: string[];
      }
    `);
    const declaration = findInterface(sourceFile, "ProductRecord");
    const property = findInterfaceProperty(declaration, "products");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
      extensions: [extension],
    });

    expect(analysis?.entries).toEqual([]);
  });

  it("normalizes extension metadata tag names during validation and parsing", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "ExternalName",
          declarationKinds: ["field"],
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface ProductRecord {
        /** @externalName Product */
        product: string;
      }
    `);
    const declaration = findInterface(sourceFile, "ProductRecord");
    const property = findInterfaceProperty(declaration, "product");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
      extensions: [extension],
    });

    expect(analysis?.applicableSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          tagName: "externalName",
        }),
      ])
    );
    expect(analysis?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          tagName: "externalName",
          value: "Product",
          source: "explicit",
        }),
      ])
    );
  });

  it("rejects duplicate metadata slot IDs across extensions", () => {
    const extensions = [
      defineExtension({
        extensionId: "x-example/metadata-a",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "externalName",
            tagName: "externalName",
            declarationKinds: ["field"],
          }),
        ],
      }),
      defineExtension({
        extensionId: "x-example/metadata-b",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "externalName",
            tagName: "billingLabel",
            declarationKinds: ["field"],
          }),
        ],
      }),
    ] as const;
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions,
      })
    ).toThrow('Duplicate metadata slot ID: "externalName"');
  });

  it("rejects duplicate metadata tags that differ only by leading case", () => {
    const extensions = [
      defineExtension({
        extensionId: "x-example/metadata-a",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "externalName",
            tagName: "externalName",
            declarationKinds: ["field"],
          }),
        ],
      }),
      defineExtension({
        extensionId: "x-example/metadata-b",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "billingLabel",
            tagName: "ExternalName",
            declarationKinds: ["field"],
          }),
        ],
      }),
    ] as const;
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions,
      })
    ).toThrow('Duplicate metadata tag: "@externalName"');
  });

  it("limits file analysis to declaration roots and members", () => {
    const { program, sourceFile } = createProgram(`
      export function demo(/** @apiName input_name */ input: string) {
        /** @apiName local_name */
        const localValue = 1;
        return input + localValue;
      }
    `);

    const analysis = analyzeMetadataForSourceFile({
      program,
      sourceFile,
    });

    expect(analysis.map((entry) => entry.logicalName)).toEqual(["demo"]);
  });

  it("rejects extension metadata tags that shadow built-in metadata tags", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "customApiName",
          tagName: "apiName",
          declarationKinds: ["field"],
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions: [extension],
      })
    ).toThrow('Metadata tag "@apiName" conflicts with built-in metadata tags.');
  });

  it("rejects extension metadata tags that shadow built-in constraint tags", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "customMinimum",
          tagName: "minimum",
          declarationKinds: ["field"],
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions: [extension],
      })
    ).toThrow('Metadata tag "@minimum" conflicts with existing FormSpec tag "@minimum".');
  });

  it("rejects duplicate metadata slot IDs across extensions before normalization", () => {
    const extensions = [
      defineExtension({
        extensionId: "x-example/metadata-a",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "externalName",
            tagName: "externalName",
            declarationKinds: ["field"],
          }),
        ],
      }),
      defineExtension({
        extensionId: "x-example/metadata-b",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "externalName",
            tagName: "billingName",
            declarationKinds: ["field"],
          }),
        ],
      }),
    ];
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions,
      })
    ).toThrow('Duplicate metadata slot ID: "externalName"');
  });

  it("normalizes extension metadata tag names during validation and parsing", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "ExternalName",
          declarationKinds: ["field"],
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface ProductRecord {
        /** @externalName PRODUCTS */
        products: string[];
      }
    `);
    const declaration = findInterface(sourceFile, "ProductRecord");
    const property = findInterfaceProperty(declaration, "products");

    const analysis = analyzeMetadataForNode({
      program,
      node: property,
      extensions: [extension],
    });

    expect(analysis?.applicableSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          tagName: "externalName",
        }),
      ])
    );
    expect(analysis?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          tagName: "externalName",
          value: "PRODUCTS",
          source: "explicit",
        }),
      ])
    );
  });

  it("rejects extension metadata tags that shadow extension constraint tags", () => {
    const extension = defineExtension({
      extensionId: "x-example/metadata",
      constraintTags: [defineConstraintTag({ tagName: "currency", constraintName: "currency", parseValue: (raw) => raw })],
      metadataSlots: [
        defineMetadataSlot({
          slotId: "currencyLabel",
          tagName: "currency",
          declarationKinds: ["field"],
        }),
      ],
    });
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions: [extension],
      })
    ).toThrow('Metadata tag "@currency" conflicts with existing FormSpec tag "@currency".');
  });

  it("rejects metadata tag duplicates that differ only by leading case", () => {
    const extensions = [
      defineExtension({
        extensionId: "x-example/metadata-a",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "currencyLabel",
            tagName: "Currency",
            declarationKinds: ["field"],
          }),
        ],
      }),
      defineExtension({
        extensionId: "x-example/metadata-b",
        metadataSlots: [
          defineMetadataSlot({
            slotId: "currencyCode",
            tagName: "currency",
            declarationKinds: ["field"],
          }),
        ],
      }),
    ];
    const { program, sourceFile } = createProgram(`
      export interface CustomerRecord {
        customerName: string;
      }
    `);
    const declaration = findInterface(sourceFile, "CustomerRecord");
    const property = findInterfaceProperty(declaration, "customerName");

    expect(() =>
      analyzeMetadataForNode({
        program,
        node: property,
        extensions,
      })
    ).toThrow('Duplicate metadata tag: "@currency"');
  });
});
