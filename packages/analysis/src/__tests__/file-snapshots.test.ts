import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defineConstraint,
  defineConstraintTag,
  defineExtension,
  defineMetadataSlot,
} from "@formspec/core";
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

  it("emits a single structured diagnostic for unsupported built-in overrides in one comment block", () => {
    const source = `
      interface Foo {
        items: Array<string>;

        /**
         * @minLength 1
         * @maxLength 10
         */
        label: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-unsupported-override.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensions: [
        {
          extensionId: "x-example/array",
          customTypes: [{ tsTypeNames: ["Array"] }],
        },
      ],
    });

    expect(
      snapshot.diagnostics.filter(
        (diagnostic) => diagnostic.code === "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"
      )
    ).toHaveLength(1);
    expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH")).toBe(
      false
    );
  });

  it("emits a setup diagnostic instead of TYPE_MISMATCH for invalid custom type registrations", () => {
    const source = `
      interface Foo {
        /**
         * @minLength 1
         * @maxLength 10
         */
        label: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-invalid-custom-type.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensions: [
        {
          extensionId: "x-example/invalid-type",
          customTypes: [{ tsTypeNames: ["Not A Type"] }],
        },
      ],
    });

    expect(
      snapshot.diagnostics.filter((diagnostic) => diagnostic.code === "SYNTHETIC_SETUP_FAILURE")
    ).toHaveLength(1);
    expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH")).toBe(
      false
    );
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

  it("derives declaration-level summaries with resolved metadata and combined constraints", () => {
    const source = `
      class ProgramSettings {
        /**
         * Internal program name
         * @displayName Program Name
         * @minLength 1
         * @maxLength 20
         * @pattern ^[a-z]+$
         * @defaultValue "demo"
         */
        name!: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-declaration-summary.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    const comment = snapshot.comments[0];

    expect(comment).toBeDefined();
    expect(comment?.declarationSummary.summaryText).toBe("Internal program name");
    expect(comment?.declarationSummary.resolvedMetadata?.displayName?.value).toBe("Program Name");
    expect(comment?.declarationSummary.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "description",
          value: "Internal program name",
        }),
        expect.objectContaining({
          kind: "string-constraints",
          targetPath: null,
          minLength: 1,
          maxLength: 20,
          patterns: ["^[a-z]+$"],
        }),
        expect.objectContaining({
          kind: "default-value",
          value: "demo",
        }),
      ])
    );
    expect(comment?.declarationSummary.hoverMarkdown).toContain("Program Name");
    expect(comment?.declarationSummary.hoverMarkdown).toContain("length 1-20");
  });

  it("keeps summary-only declaration comments in the snapshot", () => {
    const source = `
      class Checkout {
        /**
         * Internal program name
         * that spans multiple lines.
         */
        name!: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-summary-only-comment.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    const comment = snapshot.comments.find((entry) => entry.subjectType === "string");

    expect(comment).toBeDefined();
    expect(comment?.tags).toEqual([]);
    expect(comment?.declarationSummary.summaryText).toBe(
      "Internal program name\nthat spans multiple lines."
    );
    expect(comment?.declarationSummary.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "description",
          value: "Internal program name\nthat spans multiple lines.",
        }),
      ])
    );
  });

  it("preserves multiline block-tag text in declaration summaries", () => {
    const source = `
      class Checkout {
        /**
         * Internal program name
         * @remarks First line of remarks.
         * Second line of remarks.
         * @deprecated First line of guidance.
         * Second line of guidance.
         */
        name!: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-multiline-block-tags.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    const comment = snapshot.comments.find((entry) => entry.subjectType === "string");

    expect(comment?.declarationSummary.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "remarks",
          value: "First line of remarks.\nSecond line of remarks.",
        }),
        expect.objectContaining({
          kind: "deprecated",
          message: "First line of guidance.\nSecond line of guidance.",
        }),
      ])
    );
  });

  it("keeps empty-payload boolean constraints and continuation-only block tags", () => {
    const source = `
      class Checkout {
        /**
         * @uniqueItems
         * @remarks
         * Every label must be distinct.
         */
        labels!: string[];
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-empty-payload-constraints.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    const comment = snapshot.comments.find((entry) => entry.subjectType === "string[]");

    expect(comment?.declarationSummary.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "array-constraints",
          targetPath: null,
          uniqueItems: true,
        }),
        expect.objectContaining({
          kind: "remarks",
          value: "Every label must be distinct.",
        }),
      ])
    );
  });

  it("includes extension metadata and custom constraint facts in declaration summaries", () => {
    const extension = defineExtension({
      extensionId: "x-example/money",
      constraints: [
        defineConstraint({
          constraintName: "Currency",
          applicableTypes: null,
          compositionRule: "override",
          toJsonSchema() {
            return {};
          },
        }),
      ],
      constraintTags: [
        defineConstraintTag({
          tagName: "currency",
          constraintName: "Currency",
          parseValue(raw) {
            return raw.trim();
          },
        }),
      ],
      metadataSlots: [
        defineMetadataSlot({
          slotId: "externalName",
          tagName: "externalName",
          declarationKinds: ["field"],
        }),
      ],
    });
    const source = `
      interface Checkout {
        /**
         * @externalName TOTAL_AMOUNT
         * @currency USD
         */
        total: string;
      }
    `;
    const { checker, sourceFile } = createProgram(source, "/virtual/formspec-extension-summary.ts");

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [extension],
    });
    const comment = snapshot.comments.find((entry) => entry.subjectType === "string");

    expect(comment?.declarationSummary.metadataEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotId: "externalName",
          tagName: "externalName",
          value: "TOTAL_AMOUNT",
          source: "explicit",
        }),
      ])
    );
    expect(comment?.declarationSummary.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "custom-constraint",
          constraintId: "x-example/money/Currency",
          compositionRule: "override",
          payload: "USD",
        }),
      ])
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

  it("captures discriminator diagnostics with related target-field locations", () => {
    const source = `
      /** @discriminator :kind T */
      interface TaggedValue<T> {
        kind?: string;
        id: string;
      }
    `;
    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/formspec-discriminator-diagnostics.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });

    const diagnostic = snapshot.diagnostics.find((entry) => entry.code === "OPTIONAL_TARGET_FIELD");
    const targetStart = source.indexOf("kind?: string;");
    const targetEnd = targetStart + "kind?: string;".length;
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.category).toBe("target-resolution");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.data["tagName"]).toBe("discriminator");
    expect(diagnostic?.relatedLocations).toEqual([
      {
        filePath: sourceFile.fileName,
        range: { start: targetStart, end: targetEnd },
        message: "Target field declaration",
      },
    ]);
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
