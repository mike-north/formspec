import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";

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
    ) as Record<string, unknown>;
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

  // Custom decorator extensions (x-formspec-*) are not yet emitted by the IR
  // JSON Schema generator. The IR supports CustomAnnotationNode but the generator
  // needs to map them to x-formspec-* properties.
  it.todo("emits x-formspec-ui-hints for Title decorator (requires extension IR support)");
  it.todo("emits x-formspec-ui-hints for Subtitle decorator (requires extension IR support)");
  it.todo(
    "emits x-formspec-actions for Action decorator with params (requires extension IR support)"
  );
  it.todo("emits x-formspec-actions for cancel action (requires extension IR support)");

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
    const elements = result.uiSchema.elements as Array<{
      type: string;
      label?: string;
      elements?: Array<{ type: string; scope?: string }>;
    }>;

    // Top-level elements are the three Group nodes in definition order.
    expect(elements.map((el) => ({ type: el.type, label: el.label }))).toEqual([
      { type: "Group", label: "Header" },
      { type: "Group", label: "Details" },
      { type: "Group", label: "Actions" },
    ]);

    // The Details group contains priority, status, and assignee Controls.
    const detailsGroup = elements[1];
    expect(detailsGroup?.type).toBe("Group");
    expect(detailsGroup?.label).toBe("Details");
    const detailsScopes = detailsGroup?.elements?.map((el) => el.scope) ?? [];
    expect(detailsScopes).toContain("#/properties/priority");
    expect(detailsScopes).toContain("#/properties/status");
    expect(detailsScopes).toContain("#/properties/assignee");
  });
});
