import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defineConstraintTag, defineExtension, defineMetadataSlot } from "@formspec/core";
import { createProgramContext, findInterfaceByName } from "../analyzer/program.js";
import { analyzeInterfaceToIR } from "../analyzer/class-analyzer.js";
import { createExtensionRegistry } from "../extensions/index.js";

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-build-metadata-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

describe("build metadata extension integration", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts extension-defined metadata tags through extensionRegistry without breaking built-in analysis", () => {
    const filePath = writeTempSource(`
      export interface InvoiceModel {
        /**
         * Invoice amount summary.
         * @billingLabel Invoice
         * @apiName invoice_amount
         */
        amount: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const ctx = createProgramContext(filePath);
    const decl = findInterfaceByName(ctx.sourceFile, "InvoiceModel");
    if (!decl) {
      throw new Error("InvoiceModel interface not found");
    }

    const extensionRegistry = createExtensionRegistry([
      {
        extensionId: "x-test/metadata",
        metadataSlots: [
          {
            slotId: "billingLabel",
            tagName: "billingLabel",
            declarationKinds: ["field"],
          },
        ],
      },
    ]);

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, filePath, extensionRegistry);
    const amountField = analysis.fields.find((field) => field.name === "amount");
    if (!amountField) {
      throw new Error('Expected field "amount"');
    }

    expect(amountField.metadata).toMatchObject({
      apiName: { value: "invoice_amount", source: "explicit" },
    });
    expect(amountField.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          annotationKind: "description",
          value: "Invoice amount summary.",
        }),
      ])
    );
  });

  it("treats :singular built-in metadata tags as explicit default metadata in build analysis", () => {
    const filePath = writeTempSource(`
      export interface InvoiceModel {
        /** @apiName :singular invoice_amount */
        amount: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const ctx = createProgramContext(filePath);
    const decl = findInterfaceByName(ctx.sourceFile, "InvoiceModel");
    if (!decl) {
      throw new Error("InvoiceModel interface not found");
    }

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, filePath);
    const amountField = analysis.fields.find((field) => field.name === "amount");
    if (!amountField) {
      throw new Error('Expected field "amount"');
    }

    expect(amountField.metadata).toMatchObject({
      apiName: { value: "invoice_amount", source: "explicit" },
    });
  });

  it("preserves buildContext details for metadata policy inference hooks", () => {
    const filePath = writeTempSource(`
      export interface InvoiceModel {
        amount: string;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const ctx = createProgramContext(filePath);
    const decl = findInterfaceByName(ctx.sourceFile, "InvoiceModel");
    if (!decl) {
      throw new Error("InvoiceModel interface not found");
    }

    const analysis = analyzeInterfaceToIR(decl, ctx.checker, filePath, undefined, {
      field: {
        displayName: {
          mode: "infer-if-missing",
          infer: ({ logicalName, buildContext }) => {
            const context = buildContext as {
              declaration?: unknown;
              subjectType?: unknown;
              hostType?: unknown;
            };
            return context.declaration !== undefined &&
              context.subjectType !== undefined &&
              context.hostType !== undefined
              ? `Label ${logicalName}`
              : "missing-build-context";
          },
        },
      },
    });
    const amountField = analysis.fields.find((field) => field.name === "amount");
    if (!amountField) {
      throw new Error('Expected field "amount"');
    }

    expect(amountField.metadata).toMatchObject({
      displayName: { value: "Label amount", source: "inferred" },
    });
  });

  it("rejects metadata tags that collide with extension constraint tags at registry creation", () => {
    expect(() =>
      createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/metadata",
          constraintTags: [
            defineConstraintTag({
              tagName: "currency",
              constraintName: "currency",
            }),
          ],
          metadataSlots: [
            defineMetadataSlot({
              slotId: "currencyLabel",
              tagName: "currency",
              declarationKinds: ["field"],
            }),
          ],
        }),
      ])
    ).toThrow('Metadata tag "@currency" conflicts with existing FormSpec tag "@currency".');
  });

  it("rejects metadata tags that differ from constraint tags only by leading case", () => {
    expect(() =>
      createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/metadata",
          constraintTags: [
            defineConstraintTag({
              tagName: "currency",
              constraintName: "currency",
            }),
          ],
          metadataSlots: [
            defineMetadataSlot({
              slotId: "currencyLabel",
              tagName: "Currency",
              declarationKinds: ["field"],
            }),
          ],
        }),
      ])
    ).toThrow('Metadata tag "@currency" conflicts with existing FormSpec tag "@currency".');
  });

  it("rejects metadata tags that differ only by leading case at registry creation", () => {
    expect(() =>
      createExtensionRegistry([
        defineExtension({
          extensionId: "x-test/metadata-a",
          metadataSlots: [
            defineMetadataSlot({
              slotId: "currencyLabel",
              tagName: "Currency",
              declarationKinds: ["field"],
            }),
          ],
        }),
        defineExtension({
          extensionId: "x-test/metadata-b",
          metadataSlots: [
            defineMetadataSlot({
              slotId: "currencyCode",
              tagName: "currency",
              declarationKinds: ["field"],
            }),
          ],
        }),
      ])
    ).toThrow('Duplicate metadata tag: "@currency"');
  });
});
