import { describe, it, expect } from "vitest";
import { field, group, when, is, formspec } from "@formspec/dsl";
import {
  validateFormSpecElements,
  validateFieldTypes,
  validateLayout,
  validateFieldOptions,
  extractFieldOptions,
  defineConstraints,
} from "../index.js";

describe("validateFieldTypes", () => {
  it("returns no issues when field type is allowed", () => {
    const issues = validateFieldTypes(
      { fieldType: "text", fieldName: "name" },
      { text: "off" }
    );
    expect(issues).toHaveLength(0);
  });

  it("returns error when field type is disallowed", () => {
    const issues = validateFieldTypes(
      { fieldType: "dynamic_enum", fieldName: "country" },
      { dynamicEnum: "error" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "DISALLOWED_FIELD_TYPE",
      severity: "error",
      fieldName: "country",
      fieldType: "dynamic_enum",
    });
  });

  it("returns warning when field type has warn severity", () => {
    const issues = validateFieldTypes(
      { fieldType: "array", fieldName: "items" },
      { array: "warn" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("includes path in issue when provided", () => {
    const issues = validateFieldTypes(
      { fieldType: "object", fieldName: "address", path: "user/address" },
      { object: "error" }
    );
    expect(issues[0]?.path).toBe("user/address");
  });
});

describe("validateLayout", () => {
  it("returns no issues when group is allowed", () => {
    const issues = validateLayout(
      { layoutType: "group", label: "Contact", depth: 0 },
      { group: "off" }
    );
    expect(issues).toHaveLength(0);
  });

  it("returns error when group is disallowed", () => {
    const issues = validateLayout(
      { layoutType: "group", label: "Contact", depth: 0 },
      { group: "error" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "DISALLOWED_GROUP",
      severity: "error",
    });
    expect(issues[0]?.message).toContain("Contact");
  });

  it("returns error when conditional is disallowed", () => {
    const issues = validateLayout(
      { layoutType: "conditional", depth: 0 },
      { conditionals: "error" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "DISALLOWED_CONDITIONAL",
      severity: "error",
    });
  });

  it("returns error when nesting depth exceeded", () => {
    const issues = validateLayout(
      { layoutType: "group", depth: 3 },
      { maxNestingDepth: 2 }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "EXCEEDED_NESTING_DEPTH",
      severity: "error",
    });
  });

  it("allows nesting at exact max depth", () => {
    const issues = validateLayout(
      { layoutType: "group", depth: 2 },
      { maxNestingDepth: 2 }
    );
    // Should only have group issue if group is disallowed, not depth issue
    const depthIssues = issues.filter(
      (i) => i.code === "EXCEEDED_NESTING_DEPTH"
    );
    expect(depthIssues).toHaveLength(0);
  });
});

describe("validateFieldOptions", () => {
  it("returns no issues when options are allowed", () => {
    const issues = validateFieldOptions(
      { fieldName: "age", presentOptions: ["min", "max"] },
      { min: "off", max: "off" }
    );
    expect(issues).toHaveLength(0);
  });

  it("returns error when option is disallowed", () => {
    const issues = validateFieldOptions(
      { fieldName: "notes", presentOptions: ["placeholder"] },
      { placeholder: "error" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "DISALLOWED_FIELD_OPTION",
      severity: "error",
      fieldName: "notes",
    });
  });

  it("returns multiple issues for multiple disallowed options", () => {
    const issues = validateFieldOptions(
      { fieldName: "items", presentOptions: ["minItems", "maxItems"] },
      { minItems: "error", maxItems: "error" }
    );
    expect(issues).toHaveLength(2);
  });
});

describe("extractFieldOptions", () => {
  it("extracts present options from field object", () => {
    const options = extractFieldOptions({
      name: "age",
      label: "Age",
      min: 0,
      max: 120,
    });
    expect(options).toContain("label");
    expect(options).toContain("min");
    expect(options).toContain("max");
    expect(options).not.toContain("placeholder");
  });

  it("returns empty array for field with no options", () => {
    const options = extractFieldOptions({ name: "test" });
    expect(options).toHaveLength(0);
  });
});

describe("validateFormSpecElements", () => {
  it("validates a simple form with no constraints", () => {
    const form = formspec(
      field.text("name", { label: "Name" }),
      field.number("age", { label: "Age" })
    );

    const result = validateFormSpecElements(form.elements);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("validates field types against constraints", () => {
    const form = formspec(
      field.text("name"),
      field.dynamicEnum("country", "countries")
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        fieldTypes: { dynamicEnum: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: "DISALLOWED_FIELD_TYPE",
      fieldType: "dynamic_enum",
    });
  });

  it("validates groups against constraints", () => {
    const form = formspec(
      group("Contact", field.text("name"), field.text("email"))
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        layout: { group: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DISALLOWED_GROUP")).toBe(true);
  });

  it("validates conditionals against constraints", () => {
    const form = formspec(
      field.enum("type", ["personal", "business"] as const),
      when(is("type", "business"), field.text("company"))
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        layout: { conditionals: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DISALLOWED_CONDITIONAL")).toBe(
      true
    );
  });

  it("validates nested object fields", () => {
    const form = formspec(
      field.object(
        "address",
        field.text("street"),
        field.object("country", field.text("code"), field.text("name"))
      )
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        layout: { maxNestingDepth: 1 },
      },
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "EXCEEDED_NESTING_DEPTH")
    ).toBe(true);
  });

  it("validates field options", () => {
    const form = formspec(
      field.number("quantity", { min: 1, max: 100 })
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        fieldOptions: { min: "error", max: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(
      result.issues.every((i) => i.code === "DISALLOWED_FIELD_OPTION")
    ).toBe(true);
  });

  it("passes with warnings but valid=true", () => {
    const form = formspec(field.dynamicEnum("country", "countries"));

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        fieldTypes: { dynamicEnum: "warn" },
      },
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.severity).toBe("warning");
  });

  it("validates array items recursively", () => {
    const form = formspec(
      field.array(
        "items",
        field.text("description"),
        field.dynamicEnum("category", "categories")
      )
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        fieldTypes: { dynamicEnum: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.fieldType === "dynamic_enum")).toBe(
      true
    );
  });
});

describe("defineConstraints", () => {
  it("merges partial config with defaults", () => {
    const config = defineConstraints({
      fieldTypes: { dynamicEnum: "error" },
    });

    expect(config.fieldTypes.dynamicEnum).toBe("error");
    expect(config.fieldTypes.text).toBe("off");
    expect(config.layout.group).toBe("off");
  });

  it("preserves all provided values", () => {
    const config = defineConstraints({
      fieldTypes: {
        text: "warn",
        number: "error",
      },
      layout: {
        group: "error",
        maxNestingDepth: 2,
      },
    });

    expect(config.fieldTypes.text).toBe("warn");
    expect(config.fieldTypes.number).toBe("error");
    expect(config.layout.group).toBe("error");
    expect(config.layout.maxNestingDepth).toBe(2);
  });
});
