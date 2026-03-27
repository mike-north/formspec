import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSchemas } from "../generators/class-schema.js";

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
  });

  it("throws with CONTRADICTING_CONSTRAINTS for contradictory constraints", () => {
    expect(getGenerationFailureMessage("PriceRange")).toContain("CONTRADICTING_CONSTRAINTS");
  });

  it("throws with TYPE_MISMATCH for direct type mismatches", () => {
    expect(getGenerationFailureMessage("MismatchedForm")).toContain("TYPE_MISMATCH");
  });

  it("throws with UNKNOWN_PATH_TARGET for invalid path targets", () => {
    expect(getGenerationFailureMessage("LocationForm")).toContain("UNKNOWN_PATH_TARGET");
  });

  it("throws with TYPE_MISMATCH for invalid targeted subfield constraints", () => {
    expect(getGenerationFailureMessage("BoxForm")).toContain("TYPE_MISMATCH");
  });

  it("throws with CONSTRAINT_BROADENING for weaker use-site alias constraints", () => {
    const message = getGenerationFailureMessage("ThermostatForm");

    expect(message).toContain("CONSTRAINT_BROADENING");
    expect(message).toContain("[related:");
  });
});
