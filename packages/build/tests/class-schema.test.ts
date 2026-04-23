import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Provenance } from "@formspec/core/internals";
import type { IRClassAnalysis } from "../src/analyzer/class-analyzer.js";
import { createExtensionRegistry } from "../src/extensions/index.js";
import {
  generateClassSchemasDetailed,
  type GenerateSchemasFromProgramOptions,
  type GenerateSchemasOptions,
  generateSchemas,
  generateSchemasBatch,
  generateSchemasBatchFromProgram,
  generateSchemasDetailed,
  generateSchemasFromProgram,
  generateSchemasFromProgramDetailed,
} from "../src/generators/class-schema.js";
import * as validateModule from "../src/validate/index.js";
import type { ValidationResult } from "../src/validate/index.js";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleFormsPath = path.join(fixturesDir, "sample-forms.ts");
const classSchemaRegressionsPath = path.join(fixturesDir, "class-schema-regressions.ts");
const testFile = "/project/src/class-schema.test.ts";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

function generateSchemasFromProgramOrThrow(
  options: Omit<GenerateSchemasFromProgramOptions, "errorReporting">
) {
  return generateSchemasFromProgram({
    ...options,
    errorReporting: "throw",
  });
}

function provenance(line: number, tagName?: string): Provenance {
  return {
    surface: "chain-dsl",
    file: testFile,
    line,
    column: 0,
    ...(tagName !== undefined && { tagName }),
  };
}

function getGenerationFailureMessage(typeName: string): string {
  try {
    generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName,
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error(`Expected generateSchemas to fail for ${typeName}`);
}

describe("generateSchemas", () => {
  it("emits root title and description from class-level annotations", () => {
    const result = generateSchemasOrThrow({
      filePath: sampleFormsPath,
      typeName: "VehicleRegistration",
    });

    expect(result.jsonSchema.title).toBe("Vehicle Registration");
    expect(result.jsonSchema.description).toBe("Collect vehicle details for fleet management");
  });

  it("emits default values from @defaultValue tags", () => {
    const result = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "NotificationPreferences",
    });

    expect(result.jsonSchema.properties?.["channel"]).toMatchObject({ default: "email" });
    expect(result.jsonSchema.properties?.["retryCount"]).toMatchObject({ default: 3 });
    expect(result.jsonSchema.properties?.["enabled"]).toMatchObject({ default: true });
    expect(result.jsonSchema.properties?.["nickname"]).toMatchObject({ default: null });
  });

  it("emits format and placeholder annotations into schema outputs", () => {
    const schemaResult = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "ContactForm",
    });
    const uiResult = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "SearchForm",
    });

    expect(schemaResult.jsonSchema.properties?.["emailAddress"]).toMatchObject({ format: "email" });
    expect(uiResult.uiSchema.elements[0]).toMatchObject({
      type: "Control",
      options: { placeholder: "Search by keyword..." },
    });
  });

  it("emits deprecation messages, uniqueItems, and typed-array item constraints", () => {
    const deprecatedResult = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "SettingsForm",
    });
    const uniqueItemsResult = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "TagManager",
    });
    const typedArrayResult = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "SurveyForm",
    });

    expect(deprecatedResult.jsonSchema.properties?.["legacyName"]).toMatchObject({
      deprecated: true,
      "x-formspec-deprecation-description": "Use displayName instead",
    });
    expect(uniqueItemsResult.jsonSchema.properties?.["tags"]).toMatchObject({
      uniqueItems: true,
    });
    expect(typedArrayResult.jsonSchema.properties?.["responses"]).toMatchObject({
      items: { type: "string", maxLength: 280 },
    });
  }, 15_000);

  it("maps summary text to description and @remarks to x-formspec-remarks", () => {
    const result = generateSchemasOrThrow({
      filePath: classSchemaRegressionsPath,
      typeName: "DescriptionPrecedenceForm",
    });

    // Class-level summary populates root schema description (spec 002 §2.1)
    expect(result.jsonSchema.description).toBe(
      "Summary text becomes the root schema description when no explicit tag is present."
    );

    // summary only → description is set from summary text (spec 002 §2.1)
    expect(result.jsonSchema.properties?.["summary"]).toMatchObject({
      description: "Summary text becomes the description.",
    });

    // summary + @remarks → description from summary, remarks to x-formspec-remarks (spec 002 §2.3)
    expect(result.jsonSchema.properties?.["summaryAndRemarks"]).toMatchObject({
      description: "Summary populates description; remarks go to x-formspec-remarks.",
      "x-formspec-remarks": "Additional context for tooling.",
    });

    // @remarks only → no description, remarks to x-formspec-remarks (spec 003 §3.2)
    expect(result.jsonSchema.properties?.["remarksOnly"]).not.toHaveProperty("description");
    expect(result.jsonSchema.properties?.["remarksOnly"]).toMatchObject({
      "x-formspec-remarks": "Remarks go to x-formspec-remarks, not description.",
    });

    // tag-only comments should not leak tag text into the description
    expect(result.jsonSchema.properties?.["modifierTagOnly"]).not.toHaveProperty("description");
  });

  it("throws with CONTRADICTING_CONSTRAINTS for contradictory constraints", () => {
    expect(getGenerationFailureMessage("PriceRange")).toContain("CONTRADICTING_CONSTRAINTS");
  }, 15_000);

  it("throws with TYPE_MISMATCH for direct type mismatches", () => {
    expect(getGenerationFailureMessage("MismatchedForm")).toContain("TYPE_MISMATCH");
  });

  it("throws with UNKNOWN_PATH_TARGET for invalid path targets", () => {
    expect(getGenerationFailureMessage("LocationForm")).toContain("UNKNOWN_PATH_TARGET");
  });

  it("throws with TYPE_MISMATCH for invalid targeted subfield constraints", () => {
    expect(getGenerationFailureMessage("BoxForm")).toContain("TYPE_MISMATCH");
  });

  it("appends a path-target hint when an object field has exactly one matching subfield", () => {
    const message = getGenerationFailureMessage("HintedSingleCandidateForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).toContain("Hint:");
    // Single-candidate form: full corrected example with the user's value preserved.
    expect(message).toContain("@exclusiveMinimum :value 0");
    // Should NOT use the multi-candidate "(candidates: …)" listing form.
    expect(message).not.toContain("candidates:");
  });

  it("lists candidates when an object field has multiple matching subfields", () => {
    const message = getGenerationFailureMessage("HintedMultipleCandidatesForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).toContain("Hint:");
    expect(message).toContain("candidates:");
    // Both numeric subfields are listed as candidates.
    expect(message).toContain("width");
    expect(message).toContain("height");
    // The non-numeric subfield must NOT appear as a candidate.
    expect(message).not.toMatch(/candidates: [^)]*\blabel\b/);
    // Concrete worked example uses one of the candidates.
    expect(message).toMatch(/e\.g\. @minimum :(width|height) 1/);
  });

  it("does not append a hint when no subfield satisfies the capability", () => {
    const message = getGenerationFailureMessage("HintlessNoCandidatesForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).not.toContain("Hint:");
  });

  it("does not append a hint when the existing primitive-mismatch is on a non-object field", () => {
    // Pre-existing fixture: @minimum 0 on `label!: string` — primitive type, no
    // subfields to suggest. The hint must remain off in this case.
    const message = getGenerationFailureMessage("MismatchedForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).not.toContain("Hint:");
  });

  it("surfaces subfield candidates through nullish unions (regression: Copilot review on #283)", () => {
    const message = getGenerationFailureMessage("HintedNullablePriceForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).toContain("Hint:");
    expect(message).toContain("@exclusiveMinimum :value 0");
  });

  it("suggests `string[]` subfields for string-like constraints (regression: Copilot review on #283)", () => {
    const message = getGenerationFailureMessage("HintedStringLikeArrayCandidateForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).toContain("Hint:");
    // `tags: string[]` qualifies via supportsConstraintCapability's array unwrap.
    expect(message).toContain("tags");
    // `count: number` must not appear as a string-like candidate.
    expect(message).not.toMatch(/:count\b/);
  });

  it("ignores intrinsic Function members when recursing into method types (regression: Copilot review on #283)", () => {
    const message = getGenerationFailureMessage("HintedFiltersCallableMembersForm");

    expect(message).toContain("TYPE_MISMATCH");
    expect(message).toContain("Hint:");
    expect(message).toContain("value");
    // Function.prototype members must not leak into the suggestion list.
    expect(message).not.toMatch(/:helper\./);
    expect(message).not.toContain("apply");
    expect(message).not.toContain("__brand");
  });

  it("throws with INVALID_TAG_PLACEMENT for builtin constraints on class declarations", () => {
    expect(getGenerationFailureMessage("InvalidPlacementForm")).toContain("INVALID_TAG_PLACEMENT");
  });

  it("throws with CONSTRAINT_BROADENING for weaker use-site alias constraints", () => {
    const message = getGenerationFailureMessage("ThermostatForm");

    expect(message).toContain("CONSTRAINT_BROADENING");
    expect(message).toContain("[related:");
  });

  it("returns structured diagnostics when errorReporting is diagnostics", () => {
    const result = generateSchemas({
      filePath: classSchemaRegressionsPath,
      typeName: "MismatchedForm",
      errorReporting: "diagnostics",
    });

    expect(result.ok).toBe(false);
    expect(result.jsonSchema).toBeUndefined();
    expect(result.uiSchema).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_MISMATCH");
  });

  it("throws when errorReporting is throw", () => {
    expect(() =>
      generateSchemasOrThrow({
        filePath: classSchemaRegressionsPath,
        typeName: "MismatchedForm",
      })
    ).toThrow(/TYPE_MISMATCH/);
  });

  it("returns structured diagnostics instead of throwing from the detailed API", () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const result = generateSchemasDetailed({
      filePath: classSchemaRegressionsPath,
      typeName: "MismatchedForm",
    });

    expect(result.ok).toBe(false);
    expect(result.jsonSchema).toBeUndefined();
    expect(result.uiSchema).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_MISMATCH");
  });

  it("returns target-not-found diagnostics from the detailed API", () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const result = generateSchemasDetailed({
      filePath: classSchemaRegressionsPath,
      typeName: "MissingExport",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toMatchObject([
      {
        code: "TYPE_NOT_FOUND",
      },
    ]);
  });

  it("includes validation warnings in successful detailed generation results", () => {
    const analysis: IRClassAnalysis = {
      name: "PriceModel",
      fields: [
        {
          kind: "field",
          name: "price",
          type: { kind: "primitive", primitiveKind: "string" },
          required: true,
          constraints: [],
          annotations: [],
          provenance: provenance(1),
        },
      ],
      fieldLayouts: [{}],
      typeRegistry: {},
      instanceMethods: [],
      staticMethods: [],
    };
    const validationResult: ValidationResult = {
      valid: true,
      diagnostics: [
        {
          code: "UNKNOWN_EXTENSION",
          message: "warn",
          severity: "warning",
          primaryLocation: provenance(1),
          relatedLocations: [],
        },
      ],
    };
    const validateSpy = vi
      .spyOn(validateModule, "validateIR")
      .mockReturnValueOnce(validationResult);

    const result = generateClassSchemasDetailed(
      analysis,
      { file: testFile },
      {
        extensionRegistry: createExtensionRegistry([]),
      }
    );
    validateSpy.mockRestore();

    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("UNKNOWN_EXTENSION");
  });

  it("can accumulate mixed results across a batch request", () => {
    const results = generateSchemasBatch({
      targets: [
        { filePath: classSchemaRegressionsPath, typeName: "NotificationPreferences" },
        { filePath: classSchemaRegressionsPath, typeName: "MismatchedForm" },
        { filePath: classSchemaRegressionsPath, typeName: "MissingExport" },
      ],
    });

    expect(results).toHaveLength(3);
    const [first, second, third] = results;
    if (!first || !second || !third) throw new Error("expected 3 results");
    expect(first).toMatchObject({
      filePath: classSchemaRegressionsPath,
      typeName: "NotificationPreferences",
      ok: true,
    });
    expect(first.jsonSchema?.properties?.["channel"]).toMatchObject({ default: "email" });
    expect(second.diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_MISMATCH");
    expect(third.diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_NOT_FOUND");
  });

  it("can analyze within an existing TypeScript program", () => {
    const program = ts.createProgram([sampleFormsPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
    });

    const result = generateSchemasFromProgramOrThrow({
      program,
      filePath: sampleFormsPath,
      typeName: "VehicleRegistration",
    });

    expect(result.jsonSchema.title).toBe("Vehicle Registration");
  });

  it("returns structured diagnostics from an existing program when requested", () => {
    const program = ts.createProgram([classSchemaRegressionsPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
    });

    const result = generateSchemasFromProgram({
      program,
      filePath: classSchemaRegressionsPath,
      typeName: "MismatchedForm",
      errorReporting: "diagnostics",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_MISMATCH");
  });

  it("returns structured diagnostics from an existing program", () => {
    const program = ts.createProgram([classSchemaRegressionsPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const result = generateSchemasFromProgramDetailed({
      program,
      filePath: classSchemaRegressionsPath,
      typeName: "MismatchedForm",
    });
    const batchResults = generateSchemasBatchFromProgram({
      program,
      targets: [
        { filePath: classSchemaRegressionsPath, typeName: "NotificationPreferences" },
        { filePath: classSchemaRegressionsPath, typeName: "MissingExport" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_MISMATCH");
    expect(batchResults).toHaveLength(2);
    const [batchFirst, batchSecond] = batchResults;
    if (!batchFirst || !batchSecond) throw new Error("expected 2 batch results");
    expect(batchFirst.ok).toBe(true);
    expect(batchSecond.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "TYPE_NOT_FOUND"
    );
  });
});
