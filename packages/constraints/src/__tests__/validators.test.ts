import { describe, it, expect } from "vitest";
import { field, group, when, is, formspec } from "@formspec/dsl";
import {
  validateFormSpecElements,
  validateFormSpec,
  validateFieldTypes,
  validateLayout,
  validateFieldOptions,
  extractFieldOptions,
  defineConstraints,
  isFieldTypeAllowed,
  getFieldTypeSeverity,
  isFieldOptionAllowed,
  getFieldOptionSeverity,
  isLayoutTypeAllowed,
  isNestingDepthAllowed,
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
      { fieldName: "age", presentOptions: ["minValue", "maxValue"] },
      { minValue: "off", maxValue: "off" }
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
      minValue: 0,
      maxValue: 120,
    });
    expect(options).toContain("label");
    expect(options).toContain("minValue");
    expect(options).toContain("maxValue");
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
        fieldOptions: { minValue: "error", maxValue: "error" },
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

describe("validateFormSpec", () => {
  it("validates a FormSpec object directly", () => {
    const form = formspec(
      field.text("name"),
      field.dynamicEnum("country", "countries")
    );

    const result = validateFormSpec(form, {
      constraints: {
        fieldTypes: { dynamicEnum: "error" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });
});

describe("isFieldTypeAllowed", () => {
  it("returns true when field type severity is off", () => {
    expect(isFieldTypeAllowed("text", { text: "off" })).toBe(true);
  });

  it("returns true when field type is not in constraints", () => {
    expect(isFieldTypeAllowed("text", {})).toBe(true);
  });

  it("returns false when field type severity is error", () => {
    expect(isFieldTypeAllowed("dynamic_enum", { dynamicEnum: "error" })).toBe(
      false
    );
  });

  it("returns false when field type severity is warn", () => {
    expect(isFieldTypeAllowed("array", { array: "warn" })).toBe(false);
  });

  it("handles unknown field types gracefully", () => {
    // Unknown field types should not cause errors
    expect(
      isFieldTypeAllowed("unknown_type" as "text", { text: "error" })
    ).toBe(true);
  });
});

describe("getFieldTypeSeverity", () => {
  it("returns severity when field type is constrained", () => {
    expect(getFieldTypeSeverity("dynamic_enum", { dynamicEnum: "error" })).toBe(
      "error"
    );
  });

  it("returns off when field type is not constrained", () => {
    expect(getFieldTypeSeverity("text", {})).toBe("off");
  });

  it("returns warn when field type has warn severity", () => {
    expect(getFieldTypeSeverity("array", { array: "warn" })).toBe("warn");
  });

  it("returns off for unknown field types", () => {
    expect(getFieldTypeSeverity("unknown_type" as "text", { text: "error" })).toBe(
      "off"
    );
  });
});

describe("isFieldOptionAllowed", () => {
  it("returns true when option severity is off", () => {
    expect(isFieldOptionAllowed("label", { label: "off" })).toBe(true);
  });

  it("returns true when option is not in constraints", () => {
    expect(isFieldOptionAllowed("placeholder", {})).toBe(true);
  });

  it("returns false when option severity is error", () => {
    expect(isFieldOptionAllowed("minValue", { minValue: "error" })).toBe(false);
  });

  it("returns false when option severity is warn", () => {
    expect(isFieldOptionAllowed("maxItems", { maxItems: "warn" })).toBe(false);
  });
});

describe("getFieldOptionSeverity", () => {
  it("returns severity when option is constrained", () => {
    expect(getFieldOptionSeverity("placeholder", { placeholder: "error" })).toBe(
      "error"
    );
  });

  it("returns off when option is not constrained", () => {
    expect(getFieldOptionSeverity("label", {})).toBe("off");
  });

  it("returns warn when option has warn severity", () => {
    expect(getFieldOptionSeverity("required", { required: "warn" })).toBe("warn");
  });
});

describe("isLayoutTypeAllowed", () => {
  it("returns true when group is allowed", () => {
    expect(isLayoutTypeAllowed("group", { group: "off" })).toBe(true);
  });

  it("returns true when layout type is not in constraints", () => {
    expect(isLayoutTypeAllowed("group", {})).toBe(true);
    expect(isLayoutTypeAllowed("conditional", {})).toBe(true);
  });

  it("returns false when group is disallowed", () => {
    expect(isLayoutTypeAllowed("group", { group: "error" })).toBe(false);
  });

  it("returns false when conditional is disallowed", () => {
    expect(isLayoutTypeAllowed("conditional", { conditionals: "error" })).toBe(
      false
    );
  });

  it("returns false when layout type has warn severity", () => {
    expect(isLayoutTypeAllowed("group", { group: "warn" })).toBe(false);
  });
});

describe("isNestingDepthAllowed", () => {
  it("returns true when depth is within limit", () => {
    expect(isNestingDepthAllowed(2, { maxNestingDepth: 5 })).toBe(true);
  });

  it("returns true when depth equals max", () => {
    expect(isNestingDepthAllowed(3, { maxNestingDepth: 3 })).toBe(true);
  });

  it("returns false when depth exceeds max", () => {
    expect(isNestingDepthAllowed(4, { maxNestingDepth: 3 })).toBe(false);
  });

  it("returns true when maxNestingDepth is not set", () => {
    expect(isNestingDepthAllowed(10, {})).toBe(true);
  });

  it("returns true when maxNestingDepth is Infinity", () => {
    expect(isNestingDepthAllowed(100, { maxNestingDepth: Infinity })).toBe(true);
  });

  it("handles depth of 0", () => {
    expect(isNestingDepthAllowed(0, { maxNestingDepth: 0 })).toBe(true);
    expect(isNestingDepthAllowed(0, { maxNestingDepth: 5 })).toBe(true);
  });
});

describe("extractFieldOptions", () => {
  it("maps NumberField min/max to minValue/maxValue constraints", () => {
    // NumberField in core uses min/max, but constraints use minValue/maxValue
    const options = extractFieldOptions({
      name: "quantity",
      min: 1,
      max: 100,
    });
    expect(options).toContain("minValue");
    expect(options).toContain("maxValue");
  });

  it("extracts all known options", () => {
    const options = extractFieldOptions({
      name: "test",
      label: "Test",
      placeholder: "Enter value",
      required: true,
      min: 0,
      max: 100,
      minItems: 1,
      maxItems: 10,
    });
    expect(options).toEqual(
      expect.arrayContaining([
        "label",
        "placeholder",
        "required",
        "minValue",
        "maxValue",
        "minItems",
        "maxItems",
      ])
    );
  });

  it("ignores unknown properties", () => {
    const options = extractFieldOptions({
      name: "test",
      unknownOption: "value",
      anotherUnknown: 123,
    });
    expect(options).toHaveLength(0);
  });
});

describe("validateFieldTypes - negative cases", () => {
  it("ignores unknown field types", () => {
    const issues = validateFieldTypes(
      { fieldType: "custom_unknown_type", fieldName: "test" },
      { text: "error" }
    );
    expect(issues).toHaveLength(0);
  });
});

describe("validateLayout - warning severity", () => {
  it("returns warning when group has warn severity", () => {
    const issues = validateLayout(
      { layoutType: "group", label: "Test", depth: 0 },
      { group: "warn" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("returns warning when conditional has warn severity", () => {
    const issues = validateLayout(
      { layoutType: "conditional", depth: 0 },
      { conditionals: "warn" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });
});

describe("validateFieldOptions - warning severity", () => {
  it("returns warning when option has warn severity", () => {
    const issues = validateFieldOptions(
      { fieldName: "test", presentOptions: ["placeholder"] },
      { placeholder: "warn" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
  });
});

describe("validateFormSpecElements - edge cases", () => {
  it("handles empty elements array", () => {
    const result = validateFormSpecElements([]);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("handles deeply nested objects", () => {
    const form = formspec(
      field.object(
        "level1",
        field.object(
          "level2",
          field.object("level3", field.text("deepField"))
        )
      )
    );

    const result = validateFormSpecElements(form.elements, {
      constraints: {
        layout: { maxNestingDepth: 2 },
      },
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((i) => i.code === "EXCEEDED_NESTING_DEPTH")
    ).toBe(true);
  });
});
