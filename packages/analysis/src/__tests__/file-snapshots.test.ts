import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFormSpecAnalysisFileSnapshot,
  computeFormSpecTextHash,
  createFormSpecPerformanceRecorder,
} from "../internal.js";
import { createProgram } from "./helpers.js";

const MIXED_TAG_CANARY_SOURCE = `
  type Checkout = {
    /**
     * @minimum :amount 0
     * @maximum :amount 100
     * @minimum :secondaryAmount 0
     * @maximum :secondaryAmount 100
     * @minLength :label 1
     * @maxLength :label 64
     * @pattern :code ^[A-Z]+$
     * @minItems :codes 1
     * @maxItems :codes 10
     */
    discount: {
      amount: number;
      secondaryAmount: number;
      label: string;
      code: string;
      codes: string[];
    };
  };
`;
describe("file-snapshots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("uses an injected clock for deterministic generatedAt values", () => {
    const source = "class Foo { /** @minimum 0 */ value!: number; }";
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-timestamp.ts");

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      now: () => new Date("2026-03-29T12:34:56.000Z"),
    });

    expect(snapshot.generatedAt).toBe("2026-03-29T12:34:56.000Z");
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
    const diagnostic = snapshot.diagnostics.find((entry) => entry.code === "UNKNOWN_PATH_TARGET");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.category).toBe("target-resolution");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.data["tagName"]).toBe("minimum");
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
    const diagnostic = snapshot.diagnostics.find((entry) => entry.code === "TYPE_MISMATCH");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.category).toBe("type-compatibility");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.data["tagName"]).toBe("minimum");
    expect(diagnostic?.data["targetKind"]).toBe("path");
  });

  it("captures comments attached to interfaces and type aliases", () => {
    const source = `
      /** Payment status @pattern ^(draft|sent)$ */
      type FormSpecInvoiceLifecycleStatus = "draft" | "sent";

      /** Invoice payload @minimum :total 0 */
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

  it("accepts discriminator operands that start with $ when they reference local type parameters", () => {
    const source = `
      /** @discriminator :kind $Tag */
      interface TaggedValue<$Tag> {
        kind: string;
        id: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-discriminator-dollar-type-parameter.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_TYPE_PARAMETER_REFERENCE",
        }),
      ])
    );
  });

  it("uses one synthetic compiler pass for a mixed-tag canary comment and reuses the synthetic batch cache on repeated analysis", () => {
    const { checker, sourceFile } = createProgram(
      MIXED_TAG_CANARY_SOURCE,
      "/virtual/formspec-mixed-tag-canary.ts"
    );

    const firstPerformance = createFormSpecPerformanceRecorder();
    const firstSnapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      performance: firstPerformance,
    });

    expect(firstSnapshot.diagnostics).toEqual([]);
    expect(
      firstPerformance.events.some(
        (event) => event.name === "analysis.syntheticCheckBatch.createProgram"
      )
    ).toBe(true);

    const secondPerformance = createFormSpecPerformanceRecorder();
    const secondSnapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      performance: secondPerformance,
    });

    expect(secondSnapshot.diagnostics).toEqual([]);
    expect(secondSnapshot.comments).toEqual(firstSnapshot.comments);
    expect(
      secondPerformance.events.some(
        (event) => event.name === "analysis.syntheticCheckBatch.cacheHit"
      )
    ).toBe(true);
    expect(
      secondPerformance.events.some(
        (event) => event.name === "analysis.syntheticCheckBatch.createProgram"
      )
    ).toBe(false);
  });

  it("regression: does not emit false missing-name TYPE_MISMATCH diagnostics when a class field host type lowers to a named outer type", () => {
    const source = `
      class Checkout {
        /**
         * @minimum :amount 0
         * @maximum :amount 100
         * @minLength :label 1
         */
        discount!: {
          amount: number;
          label: string;
        };
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-host-type-name-regression.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    expect(snapshot.comments).toHaveLength(1);
    expect(snapshot.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Vitest matcher type inference limitation
          message: expect.stringContaining("Cannot find name 'Checkout'"),
        }),
      ])
    );
  });
});
