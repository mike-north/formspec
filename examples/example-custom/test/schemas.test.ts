import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";
import type { ExtendedJSONSchema7 } from "@formspec/build";

const formsPath = path.resolve(import.meta.dirname, "../src/forms.ts");
const schemasDir = path.resolve(import.meta.dirname, "../schemas");

describe("TaskForm schemas", () => {
  const result = generateSchemasFromClass({
    filePath: formsPath,
    className: "TaskForm",
  });

  it("generated JSON Schema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "TaskForm.schema.json"), "utf-8")
    ) as ExtendedJSONSchema7;
    expect(result.jsonSchema).toEqual(committed);
  });

  it("generated uiSchema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "TaskForm.ui.json"), "utf-8")
    ) as { elements: unknown[] };
    expect(result.uiSchema).toEqual(committed);
  });

  it("has required fields", () => {
    expect(result.jsonSchema.required).toContain("name");
    expect(result.jsonSchema.required).toContain("priority");
    expect(result.jsonSchema.required).toContain("status");
    expect(result.jsonSchema.required).toContain("submitLabel");
  });

  it("has optional fields", () => {
    expect(result.jsonSchema.required).not.toContain("description");
    expect(result.jsonSchema.required).not.toContain("assignee");
    expect(result.jsonSchema.required).not.toContain("cancelLabel");
  });

  it("emits x-formspec-ui-hints for Title decorator", () => {
    const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props["name"]).toHaveProperty("x-formspec-ui-hints", true);
  });

  it("emits x-formspec-ui-hints for Subtitle decorator", () => {
    const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props["description"]).toHaveProperty("x-formspec-ui-hints", true);
  });

  it("emits x-formspec-actions for Action decorator with params", () => {
    const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props["submitLabel"]).toHaveProperty("x-formspec-actions");
    expect(props["submitLabel"]["x-formspec-actions"]).toEqual({
      label: "Submit",
      style: "primary",
    });
  });

  it("emits x-formspec-actions for cancel action", () => {
    const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props["cancelLabel"]).toHaveProperty("x-formspec-actions");
    expect(props["cancelLabel"]["x-formspec-actions"]).toEqual({
      label: "Cancel",
      style: "secondary",
    });
  });

  it("does not emit extensions on non-custom fields", () => {
    const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
    expect(props["priority"]).not.toHaveProperty("x-formspec-ui-hints");
    expect(props["priority"]).not.toHaveProperty("x-formspec-actions");
    expect(props["assignee"]).not.toHaveProperty("x-formspec-ui-hints");
    expect(props["assignee"]).not.toHaveProperty("x-formspec-actions");
  });

  it("applies standard constraints alongside custom decorators", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["priority"]).toMatchObject({ minimum: 1 });
  });

  it("includes group assignments in uiSchema", () => {
    const nameField = result.uiSchema.elements.find((e) => e.id === "name");
    expect(nameField).toHaveProperty("group", "Header");
  });
});
