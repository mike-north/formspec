/**
 * Runtime tests for FormElement type guards.
 *
 * Fixtures are constructed manually (no DSL dependency) using the minimum
 * required fields for each element shape.
 */
import { describe, it, expect } from "vitest";
import {
  isField,
  isTextField,
  isNumberField,
  isBooleanField,
  isStaticEnumField,
  isDynamicEnumField,
  isDynamicSchemaField,
  isArrayField,
  isObjectField,
  isGroup,
  isConditional,
} from "../src/guards.js";
import type { FormElement } from "../src/types/elements.js";

// ---------------------------------------------------------------------------
// Minimal fixtures — one per element kind
// ---------------------------------------------------------------------------

const textEl: FormElement = { _type: "field", _field: "text", name: "name" };
const numberEl: FormElement = { _type: "field", _field: "number", name: "age" };
const boolEl: FormElement = { _type: "field", _field: "boolean", name: "active" };
const enumEl: FormElement = {
  _type: "field",
  _field: "enum",
  name: "status",
  options: ["a", "b"] as const,
};
const dynEnumEl: FormElement = {
  _type: "field",
  _field: "dynamic_enum",
  name: "country",
  source: "countries",
};
const dynSchemaEl: FormElement = {
  _type: "field",
  _field: "dynamic_schema",
  name: "settings",
  schemaSource: "app_settings",
};
const arrayEl: FormElement = {
  _type: "field",
  _field: "array",
  name: "items",
  items: [textEl],
};
const objectEl: FormElement = {
  _type: "field",
  _field: "object",
  name: "address",
  properties: [textEl],
};
const groupEl: FormElement = {
  _type: "group",
  label: "Group",
  elements: [textEl],
};
const conditionalEl: FormElement = {
  _type: "conditional",
  field: "name",
  value: "test",
  elements: [textEl],
};

// All field elements for bulk positive checks
const allFieldEls = [
  textEl,
  numberEl,
  boolEl,
  enumEl,
  dynEnumEl,
  dynSchemaEl,
  arrayEl,
  objectEl,
] as const;

// ---------------------------------------------------------------------------
// isField
// ---------------------------------------------------------------------------

describe("isField", () => {
  it("returns true for all field types", () => {
    for (const el of allFieldEls) {
      expect(isField(el)).toBe(true);
    }
  });

  it("returns false for group", () => {
    expect(isField(groupEl)).toBe(false);
  });

  it("returns false for conditional", () => {
    expect(isField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTextField
// ---------------------------------------------------------------------------

describe("isTextField", () => {
  it("returns true for text fields", () => {
    expect(isTextField(textEl)).toBe(true);
  });

  it("returns false for other field types", () => {
    expect(isTextField(numberEl)).toBe(false);
    expect(isTextField(boolEl)).toBe(false);
    expect(isTextField(enumEl)).toBe(false);
    expect(isTextField(dynEnumEl)).toBe(false);
    expect(isTextField(arrayEl)).toBe(false);
    expect(isTextField(objectEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isTextField(groupEl)).toBe(false);
    expect(isTextField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isNumberField
// ---------------------------------------------------------------------------

describe("isNumberField", () => {
  it("returns true for number fields", () => {
    expect(isNumberField(numberEl)).toBe(true);
  });

  it("returns false for other field types", () => {
    expect(isNumberField(textEl)).toBe(false);
    expect(isNumberField(boolEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isNumberField(groupEl)).toBe(false);
    expect(isNumberField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isBooleanField
// ---------------------------------------------------------------------------

describe("isBooleanField", () => {
  it("returns true for boolean fields", () => {
    expect(isBooleanField(boolEl)).toBe(true);
  });

  it("returns false for other field types", () => {
    expect(isBooleanField(textEl)).toBe(false);
    expect(isBooleanField(numberEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isBooleanField(groupEl)).toBe(false);
    expect(isBooleanField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isStaticEnumField
// ---------------------------------------------------------------------------

describe("isStaticEnumField", () => {
  it("returns true for static enum fields", () => {
    expect(isStaticEnumField(enumEl)).toBe(true);
  });

  it("returns false for dynamic enum fields", () => {
    expect(isStaticEnumField(dynEnumEl)).toBe(false);
  });

  it("returns false for other field types", () => {
    expect(isStaticEnumField(textEl)).toBe(false);
    expect(isStaticEnumField(numberEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isStaticEnumField(groupEl)).toBe(false);
    expect(isStaticEnumField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDynamicEnumField
// ---------------------------------------------------------------------------

describe("isDynamicEnumField", () => {
  it("returns true for dynamic enum fields", () => {
    expect(isDynamicEnumField(dynEnumEl)).toBe(true);
  });

  it("returns false for static enum fields", () => {
    expect(isDynamicEnumField(enumEl)).toBe(false);
  });

  it("returns false for other field types", () => {
    expect(isDynamicEnumField(textEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isDynamicEnumField(groupEl)).toBe(false);
    expect(isDynamicEnumField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDynamicSchemaField
// ---------------------------------------------------------------------------

describe("isDynamicSchemaField", () => {
  it("returns true for dynamic schema fields", () => {
    expect(isDynamicSchemaField(dynSchemaEl)).toBe(true);
  });

  it("returns false for dynamic enum fields", () => {
    expect(isDynamicSchemaField(dynEnumEl)).toBe(false);
  });

  it("returns false for other field types", () => {
    expect(isDynamicSchemaField(textEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isDynamicSchemaField(groupEl)).toBe(false);
    expect(isDynamicSchemaField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isArrayField
// ---------------------------------------------------------------------------

describe("isArrayField", () => {
  it("returns true for array fields", () => {
    expect(isArrayField(arrayEl)).toBe(true);
  });

  it("returns false for object fields", () => {
    expect(isArrayField(objectEl)).toBe(false);
  });

  it("returns false for other field types", () => {
    expect(isArrayField(textEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isArrayField(groupEl)).toBe(false);
    expect(isArrayField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isObjectField
// ---------------------------------------------------------------------------

describe("isObjectField", () => {
  it("returns true for object fields", () => {
    expect(isObjectField(objectEl)).toBe(true);
  });

  it("returns false for array fields", () => {
    expect(isObjectField(arrayEl)).toBe(false);
  });

  it("returns false for other field types", () => {
    expect(isObjectField(textEl)).toBe(false);
  });

  it("returns false for non-field elements", () => {
    expect(isObjectField(groupEl)).toBe(false);
    expect(isObjectField(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGroup
// ---------------------------------------------------------------------------

describe("isGroup", () => {
  it("returns true for group elements", () => {
    expect(isGroup(groupEl)).toBe(true);
  });

  it("returns false for field elements", () => {
    expect(isGroup(textEl)).toBe(false);
    expect(isGroup(numberEl)).toBe(false);
  });

  it("returns false for conditional elements", () => {
    expect(isGroup(conditionalEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isConditional
// ---------------------------------------------------------------------------

describe("isConditional", () => {
  it("returns true for conditional elements", () => {
    expect(isConditional(conditionalEl)).toBe(true);
  });

  it("returns false for field elements", () => {
    expect(isConditional(textEl)).toBe(false);
    expect(isConditional(numberEl)).toBe(false);
  });

  it("returns false for group elements", () => {
    expect(isConditional(groupEl)).toBe(false);
  });
});
