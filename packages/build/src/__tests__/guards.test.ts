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
} from "@formspec/core";
import { formspec, field, group, when, is } from "@formspec/dsl";

describe("FormElement type guards", () => {
  const form = formspec(
    field.text("name"),
    field.number("age"),
    field.boolean("active"),
    field.enum("status", ["a", "b"] as const),
    field.dynamicEnum("country", "countries"),
    field.dynamicSchema("settings", "app_settings"),
    field.array("items", field.text("item")),
    field.object("address", field.text("street")),
    group("Group", field.text("grouped")),
    when(is("name", "test"), field.text("conditional"))
  );

  const elements = form.elements;
  const [
    textEl,
    numberEl,
    boolEl,
    enumEl,
    dynEnumEl,
    dynSchemaEl,
    arrayEl,
    objectEl,
    groupEl,
    conditionalEl,
  ] = elements;

  describe("isField", () => {
    it("returns true for all field types", () => {
      expect(isField(textEl)).toBe(true);
      expect(isField(numberEl)).toBe(true);
      expect(isField(boolEl)).toBe(true);
      expect(isField(enumEl)).toBe(true);
      expect(isField(dynEnumEl)).toBe(true);
      expect(isField(dynSchemaEl)).toBe(true);
      expect(isField(arrayEl)).toBe(true);
      expect(isField(objectEl)).toBe(true);
    });

    it("returns false for group and conditional", () => {
      expect(isField(groupEl)).toBe(false);
      expect(isField(conditionalEl)).toBe(false);
    });
  });

  describe("isTextField", () => {
    it("returns true for text fields", () => {
      expect(isTextField(textEl)).toBe(true);
    });

    it("returns false for other field types and non-field elements", () => {
      expect(isTextField(numberEl)).toBe(false);
      expect(isTextField(boolEl)).toBe(false);
      expect(isTextField(groupEl)).toBe(false);
      expect(isTextField(conditionalEl)).toBe(false);
    });
  });

  describe("isNumberField", () => {
    it("returns true for number fields", () => {
      expect(isNumberField(numberEl)).toBe(true);
    });

    it("returns false for other types", () => {
      expect(isNumberField(textEl)).toBe(false);
      expect(isNumberField(groupEl)).toBe(false);
    });
  });

  describe("isBooleanField", () => {
    it("returns true for boolean fields", () => {
      expect(isBooleanField(boolEl)).toBe(true);
    });

    it("returns false for other types", () => {
      expect(isBooleanField(textEl)).toBe(false);
      expect(isBooleanField(groupEl)).toBe(false);
    });
  });

  describe("isStaticEnumField", () => {
    it("returns true for static enum fields", () => {
      expect(isStaticEnumField(enumEl)).toBe(true);
    });

    it("returns false for dynamic enum fields and other types", () => {
      expect(isStaticEnumField(dynEnumEl)).toBe(false);
      expect(isStaticEnumField(textEl)).toBe(false);
      expect(isStaticEnumField(groupEl)).toBe(false);
    });
  });

  describe("isDynamicEnumField", () => {
    it("returns true for dynamic enum fields", () => {
      expect(isDynamicEnumField(dynEnumEl)).toBe(true);
    });

    it("returns false for static enum fields and other types", () => {
      expect(isDynamicEnumField(enumEl)).toBe(false);
      expect(isDynamicEnumField(textEl)).toBe(false);
      expect(isDynamicEnumField(groupEl)).toBe(false);
    });
  });

  describe("isDynamicSchemaField", () => {
    it("returns true for dynamic schema fields", () => {
      expect(isDynamicSchemaField(dynSchemaEl)).toBe(true);
    });

    it("returns false for other types", () => {
      expect(isDynamicSchemaField(dynEnumEl)).toBe(false);
      expect(isDynamicSchemaField(textEl)).toBe(false);
      expect(isDynamicSchemaField(groupEl)).toBe(false);
    });
  });

  describe("isArrayField", () => {
    it("returns true for array fields", () => {
      expect(isArrayField(arrayEl)).toBe(true);
    });

    it("returns false for other types", () => {
      expect(isArrayField(objectEl)).toBe(false);
      expect(isArrayField(textEl)).toBe(false);
      expect(isArrayField(groupEl)).toBe(false);
    });
  });

  describe("isObjectField", () => {
    it("returns true for object fields", () => {
      expect(isObjectField(objectEl)).toBe(true);
    });

    it("returns false for other types", () => {
      expect(isObjectField(arrayEl)).toBe(false);
      expect(isObjectField(textEl)).toBe(false);
      expect(isObjectField(groupEl)).toBe(false);
    });
  });

  describe("isGroup", () => {
    it("returns true for group elements", () => {
      expect(isGroup(groupEl)).toBe(true);
    });

    it("returns false for fields and conditionals", () => {
      expect(isGroup(textEl)).toBe(false);
      expect(isGroup(conditionalEl)).toBe(false);
    });
  });

  describe("isConditional", () => {
    it("returns true for conditional elements", () => {
      expect(isConditional(conditionalEl)).toBe(true);
    });

    it("returns false for fields and groups", () => {
      expect(isConditional(textEl)).toBe(false);
      expect(isConditional(groupEl)).toBe(false);
    });
  });
});
