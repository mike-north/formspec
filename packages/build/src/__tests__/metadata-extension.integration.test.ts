import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
});
