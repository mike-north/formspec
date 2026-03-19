import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";
import type { ExtendedJSONSchema7, UISchemaElement } from "@formspec/build";

const formsPath = path.resolve(import.meta.dirname, "../src/forms.ts");
const schemasDir = path.resolve(import.meta.dirname, "../schemas");

/** Narrows to a layout element with `elements` and optional `label`. */
function findGroup(elements: UISchemaElement[], label: string) {
  return elements.find(
    (e): e is UISchemaElement & { elements: UISchemaElement[]; label: string } =>
      e.type === "Group" && "label" in e && (e as { label: string }).label === label
  );
}

describe("UserRegistrationForm schemas", () => {
  const result = generateSchemasFromClass({
    filePath: formsPath,
    className: "UserRegistrationForm",
  });

  it("generated JSON Schema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "UserRegistrationForm.schema.json"), "utf-8")
    ) as ExtendedJSONSchema7;
    expect(result.jsonSchema).toEqual(committed);
  });

  it("generated uiSchema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "UserRegistrationForm.ui.json"), "utf-8")
    ) as { elements: unknown[] };
    expect(result.uiSchema).toEqual(committed);
  });

  it("has required fields", () => {
    expect(result.jsonSchema.required).toContain("name");
    expect(result.jsonSchema.required).toContain("email");
    expect(result.jsonSchema.required).toContain("age");
    expect(result.jsonSchema.required).toContain("username");
    expect(result.jsonSchema.required).toContain("accountType");
    expect(result.jsonSchema.required).toContain("language");
  });

  it("has optional fields", () => {
    expect(result.jsonSchema.required).not.toContain("newsletter");
    expect(result.jsonSchema.required).not.toContain("companyName");
    expect(result.jsonSchema.required).not.toContain("taxId");
    expect(result.jsonSchema.required).not.toContain("plan");
  });

  it("applies string constraints", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["name"]).toMatchObject({ minLength: 2, maxLength: 100 });
    expect(props["username"]).toMatchObject({
      minLength: 3,
      maxLength: 30,
      pattern: "^[a-zA-Z0-9_]+$",
    });
    expect(props["email"]).toHaveProperty("pattern");
  });

  it("applies numeric constraints", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["age"]).toMatchObject({ minimum: 13, maximum: 120 });
  });

  it("applies enum values", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["accountType"]).toHaveProperty("enum");
    expect(props["language"]).toHaveProperty("enum");
  });

  it("marks deprecated fields", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["plan"]).toHaveProperty("deprecated", true);
  });

  it("captures default values", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["referralCode"]).toHaveProperty("default", "NONE");
  });

  it("includes display metadata in uiSchema", () => {
    const personalGroup = findGroup(result.uiSchema.elements, "Personal Information");
    const nameControl = personalGroup?.elements.find(
      (e) => e.type === "Control" && "scope" in e && e.scope === "#/properties/name"
    );
    expect(nameControl).toMatchObject({
      type: "Control",
      scope: "#/properties/name",
      label: "Full Name",
    });
  });

  it("includes group assignments in uiSchema", () => {
    const personalGroup = findGroup(result.uiSchema.elements, "Personal Information");
    expect(personalGroup).toBeDefined();
    const nameControl = personalGroup?.elements.find(
      (e) => e.type === "Control" && "scope" in e && e.scope === "#/properties/name"
    );
    expect(nameControl).toBeDefined();
  });

  it("includes showWhen conditions in uiSchema", () => {
    const businessGroup = findGroup(result.uiSchema.elements, "Business Details");
    const companyControl = businessGroup?.elements.find(
      (e) => e.type === "Control" && "scope" in e && e.scope === "#/properties/companyName"
    );
    expect(companyControl?.rule).toEqual({
      effect: "SHOW",
      condition: { scope: "#/properties/accountType", schema: { const: "business" } },
    });
  });
});
