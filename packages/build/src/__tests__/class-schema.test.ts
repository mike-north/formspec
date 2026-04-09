import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  generateSchemas,
  generateSchemasBatch,
  generateSchemasBatchFromProgram,
  generateSchemasDetailed,
  generateSchemasFromProgram,
  generateSchemasFromProgramDetailed,
} from "../generators/class-schema.js";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleFormsPath = path.join(fixturesDir, "sample-forms.ts");
const classSchemaRegressionsPath = path.join(fixturesDir, "class-schema-regressions.ts");

function getGenerationFailureMessage(typeName: string): string {
  try {
    generateSchemas({
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
    const result = generateSchemas({
      filePath: sampleFormsPath,
      typeName: "VehicleRegistration",
    });

    expect(result.jsonSchema.title).toBe("Vehicle Registration");
    expect(result.jsonSchema.description).toBe("Collect vehicle details for fleet management");
  });

  it("emits default values from @defaultValue tags", () => {
    const result = generateSchemas({
      filePath: classSchemaRegressionsPath,
      typeName: "NotificationPreferences",
    });

    expect(result.jsonSchema.properties?.["channel"]).toMatchObject({ default: "email" });
    expect(result.jsonSchema.properties?.["retryCount"]).toMatchObject({ default: 3 });
    expect(result.jsonSchema.properties?.["enabled"]).toMatchObject({ default: true });
    expect(result.jsonSchema.properties?.["nickname"]).toMatchObject({ default: null });
  });

  it("emits format and placeholder annotations into schema outputs", () => {
    const schemaResult = generateSchemas({
      filePath: classSchemaRegressionsPath,
      typeName: "ContactForm",
    });
    const uiResult = generateSchemas({
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
    const deprecatedResult = generateSchemas({
      filePath: classSchemaRegressionsPath,
      typeName: "SettingsForm",
    });
    const uniqueItemsResult = generateSchemas({
      filePath: classSchemaRegressionsPath,
      typeName: "TagManager",
    });
    const typedArrayResult = generateSchemas({
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
    const result = generateSchemas({
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

  it("throws with INVALID_TAG_PLACEMENT for builtin constraints on class declarations", () => {
    expect(getGenerationFailureMessage("InvalidPlacementForm")).toContain("INVALID_TAG_PLACEMENT");
  });

  it("throws with CONSTRAINT_BROADENING for weaker use-site alias constraints", () => {
    const message = getGenerationFailureMessage("ThermostatForm");

    expect(message).toContain("CONSTRAINT_BROADENING");
    expect(message).toContain("[related:");
  });

  it("returns structured diagnostics instead of throwing from the detailed API", () => {
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

  it("can accumulate mixed results across a batch request", () => {
    const results = generateSchemasBatch({
      targets: [
        { filePath: classSchemaRegressionsPath, typeName: "NotificationPreferences" },
        { filePath: classSchemaRegressionsPath, typeName: "MismatchedForm" },
        { filePath: classSchemaRegressionsPath, typeName: "MissingExport" },
      ],
    });

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      filePath: classSchemaRegressionsPath,
      typeName: "NotificationPreferences",
      ok: true,
    });
    expect(results[0].jsonSchema?.properties?.["channel"]).toMatchObject({ default: "email" });
    expect(results[1].diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_MISMATCH");
    expect(results[2].diagnostics.map((diagnostic) => diagnostic.code)).toContain("TYPE_NOT_FOUND");
  });

  it("can analyze within an existing TypeScript program", () => {
    const program = ts.createProgram([sampleFormsPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
    });

    const result = generateSchemasFromProgram({
      program,
      filePath: sampleFormsPath,
      typeName: "VehicleRegistration",
    });

    expect(result.jsonSchema.title).toBe("Vehicle Registration");
  });

  it("returns structured diagnostics from an existing program", () => {
    const program = ts.createProgram([classSchemaRegressionsPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
    });

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
    expect(batchResults[0].ok).toBe(true);
    expect(batchResults[1].diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "TYPE_NOT_FOUND"
    );
  });
});
