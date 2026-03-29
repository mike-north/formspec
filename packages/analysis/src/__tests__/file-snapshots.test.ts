import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot, computeFormSpecTextHash } from "../internal.js";
import { createProgram } from "./helpers.js";

describe("file-snapshots", () => {
  it("builds a serializable snapshot with semantic target completions and diagnostics", () => {
    const source = `
      /** @maximum 100 */
      type Percent = number;

      interface Discount {
        percent: Percent;
        label: string;
      }

      class Foo {
        /** @minimum :percent 120 */
        discount!: Discount;
      }
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-snapshot.ts");
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.filePath).toBe(sourceFile.fileName);
    expect(snapshot.sourceHash).toBe(computeFormSpecTextHash(source));
    expect(snapshot.comments).toHaveLength(2);

    const discountComment = snapshot.comments.find(
      (comment) => comment.placement === "class-field"
    );
    expect(discountComment).toBeDefined();
    expect(discountComment?.subjectType).toContain("Discount");
    expect(discountComment?.tags[0]?.semantic.targetCompletions).toContain("percent");
    expect(discountComment?.tags[0]?.semantic.targetCompletions).not.toContain("label");
    expect(
      snapshot.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_PATH_TARGET")
    ).toBe(false);
  });

  it("returns an empty snapshot for files without FormSpec comments", () => {
    const source = "class Foo { value!: number; }";
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-empty.ts");

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.comments).toEqual([]);
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("captures UNKNOWN_PATH_TARGET diagnostics for invalid targeted subfields", () => {
    const source = `
      class Foo {
        /** @minimum :missing 0 */
        value!: { amount: number };
      }
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-bad-path.ts");

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.comments).toHaveLength(1);
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNKNOWN_PATH_TARGET",
          severity: "error",
        }),
      ])
    );
  });

  it("captures TYPE_MISMATCH diagnostics for incompatible targeted constraints", () => {
    const source = `
      class Foo {
        /** @minimum :label 0 */
        value!: { label: string };
      }
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-bad-type.ts");

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.comments).toHaveLength(1);
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          severity: "error",
        }),
      ])
    );
  });

  it("captures comments attached to interfaces and type aliases", () => {
    const source = `
      /** @description Payment status */
      type FormSpecInvoiceLifecycleStatus = "draft" | "sent";

      /** @description Invoice payload */
      interface Invoice {
        total: number;
      }
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-types.ts");

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.comments.map((comment) => comment.placement)).toEqual(
      expect.arrayContaining(["type-alias", "interface"])
    );
  });
});
