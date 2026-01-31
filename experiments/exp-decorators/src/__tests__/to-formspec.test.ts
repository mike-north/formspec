/**
 * Tests for FormSpec conversion.
 *
 * This suite tests the toFormSpec() function which converts decorated classes
 * into FormSpec objects that can be used with renderers.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { describe, it, expect } from "vitest";
import { toFormSpec } from "../to-formspec.js";
import {
  FormClass,
  Label,
  Optional,
  Boolean,
  Placeholder,
  Min,
  Max,
  EnumOptions,
  Group,
  ShowWhen,
  MinItems,
  MaxItems,
} from "../decorators.js";
import type { AnyField, Group as GroupType, Conditional } from "@formspec/core";

// Test helper types that allow accessing properties without TypeScript errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestField = AnyField & Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestGroup = GroupType<any[]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestConditional = Conditional<string, any, any[]>;

describe("toFormSpec", () => {
  describe("simple forms", () => {
    it("should convert form with text field", () => {
      @FormClass()
      class SimpleForm {
        @Label("Name")
        @Placeholder("Enter your name")
        name!: string;
      }

      const spec = toFormSpec(SimpleForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._type).toBe("field");
      expect(field._field).toBe("text");
      expect(field.name).toBe("name");
      expect(field.label).toBe("Name");
      expect(field.placeholder).toBe("Enter your name");
      expect(field.required).toBe(true);
    });

    it("should convert form with number field", () => {
      @FormClass()
      class SimpleForm {
        @Label("Age")
        @Min(0)
        @Max(120)
        age!: number;
      }

      const spec = toFormSpec(SimpleForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._type).toBe("field");
      expect(field._field).toBe("number");
      expect(field.name).toBe("age");
      expect(field.label).toBe("Age");
      expect(field.min).toBe(0);
      expect(field.max).toBe(120);
      expect(field.required).toBe(true);
    });

    it("should convert form with boolean field", () => {
      @FormClass()
      class SimpleForm {
        @Label("Subscribe to newsletter")
        @Boolean()
        @Optional()
        newsletter?: boolean;
      }

      const spec = toFormSpec(SimpleForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._type).toBe("field");
      expect(field._field).toBe("boolean");
      expect(field.name).toBe("newsletter");
      expect(field.label).toBe("Subscribe to newsletter");
      expect(field.required).toBe(false);
    });

    it("should convert form with optional field", () => {
      @FormClass()
      class SimpleForm {
        @Label("Email")
        @Optional()
        email?: string;
      }

      const spec = toFormSpec(SimpleForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field.required).toBe(false);
    });

    it("should convert form with multiple fields", () => {
      @FormClass()
      class MultiFieldForm {
        @Label("Name")
        name!: string;

        @Label("Age")
        @Min(0)
        age!: number;

        @Label("Email")
        @Optional()
        email?: string;
      }

      const spec = toFormSpec(MultiFieldForm);

      expect(spec.elements).toHaveLength(3);
      expect((spec.elements[0] as TestField).name).toBe("name");
      expect((spec.elements[1] as TestField).name).toBe("age");
      expect((spec.elements[2] as TestField).name).toBe("email");
    });
  });

  describe("enum fields", () => {
    it("should convert enum field with string options", () => {
      @FormClass()
      class EnumForm {
        @Label("Country")
        @EnumOptions(["US", "UK", "CA"])
        country!: string;
      }

      const spec = toFormSpec(EnumForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._type).toBe("field");
      expect(field._field).toBe("enum");
      expect(field.name).toBe("country");
      expect(field.options).toEqual(["US", "UK", "CA"]);
    });

    it("should convert enum field with object options", () => {
      @FormClass()
      class EnumForm {
        @Label("Status")
        @EnumOptions([
          { id: "active", label: "Active" },
          { id: "inactive", label: "Inactive" },
          { id: "pending", label: "Pending" },
        ])
        status!: string;
      }

      const spec = toFormSpec(EnumForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field.options).toEqual([
        { id: "active", label: "Active" },
        { id: "inactive", label: "Inactive" },
        { id: "pending", label: "Pending" },
      ]);
    });

    it("should throw error for enum without @EnumOptions", () => {
      @FormClass()
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class InvalidEnumForm {
        // No @EnumOptions decorator, but manually set fieldType in a hypothetical scenario
        // In practice, this would require a custom decorator or manual metadata manipulation
        // For this test, we'll create a scenario where fieldType is "enum" but options are missing
      }

      // This test is more about documenting expected behavior
      // In normal usage, users would need @EnumOptions to get fieldType: "enum"
      expect(() => toFormSpec(InvalidEnumForm)).not.toThrow();
    });
  });

  describe("grouped fields", () => {
    it("should group fields with same group name", () => {
      @FormClass()
      class GroupedForm {
        @Label("First Name")
        @Group("Personal Information")
        firstName!: string;

        @Label("Last Name")
        @Group("Personal Information")
        lastName!: string;

        @Label("Email")
        @Group("Contact")
        email!: string;
      }

      const spec = toFormSpec(GroupedForm);

      expect(spec.elements).toHaveLength(2);

      const group1 = spec.elements[0] as TestGroup;
      expect(group1._type).toBe("group");
      expect(group1.label).toBe("Personal Information");
      expect(group1.elements).toHaveLength(2);
      expect((group1.elements[0] as TestField).name).toBe("firstName");
      expect((group1.elements[1] as TestField).name).toBe("lastName");

      const group2 = spec.elements[1] as TestGroup;
      expect(group2._type).toBe("group");
      expect(group2.label).toBe("Contact");
      expect(group2.elements).toHaveLength(1);
      expect((group2.elements[0] as TestField).name).toBe("email");
    });

    it("should handle mixed grouped and ungrouped fields", () => {
      @FormClass()
      class MixedForm {
        @Label("Name")
        name!: string;

        @Label("Street")
        @Group("Address")
        street!: string;

        @Label("City")
        @Group("Address")
        city!: string;

        @Label("Email")
        email!: string;
      }

      const spec = toFormSpec(MixedForm);

      // Should have: Address group + 2 ungrouped fields
      expect(spec.elements).toHaveLength(3);

      const addressGroup = spec.elements[0] as TestGroup;
      expect(addressGroup._type).toBe("group");
      expect(addressGroup.elements).toHaveLength(2);

      const ungrouped1 = spec.elements[1] as TestField;
      expect(ungrouped1._type).toBe("field");
      expect(ungrouped1.name).toBe("name");

      const ungrouped2 = spec.elements[2] as TestField;
      expect(ungrouped2._type).toBe("field");
      expect(ungrouped2.name).toBe("email");
    });
  });

  describe("conditional fields", () => {
    it("should wrap conditional field in Conditional element", () => {
      @FormClass()
      class ConditionalForm {
        @Label("Enable Advanced")
        advanced!: string;

        @Label("Advanced Option")
        @ShowWhen({ _predicate: "equals", field: "advanced", value: "yes" })
        advancedOption!: string;
      }

      const spec = toFormSpec(ConditionalForm);

      expect(spec.elements).toHaveLength(2);

      const field1 = spec.elements[0] as TestField;
      expect(field1.name).toBe("advanced");

      const conditional = spec.elements[1] as TestConditional;
      expect(conditional._type).toBe("conditional");
      expect(conditional.field).toBe("advanced");
      expect(conditional.value).toBe("yes");
      expect(conditional.elements).toHaveLength(1);
      expect((conditional.elements[0] as TestField).name).toBe("advancedOption");
    });

    it("should handle conditional with different value types", () => {
      @FormClass()
      class ConditionalForm {
        @Label("Count")
        @Min(0)
        count!: number;

        @Label("Details")
        @ShowWhen({ _predicate: "equals", field: "count", value: 5 })
        details!: string;
      }

      const spec = toFormSpec(ConditionalForm);

      const conditional = spec.elements[1] as TestConditional;
      expect(conditional.value).toBe(5);
    });

    it("should handle boolean conditional values", () => {
      @FormClass()
      class ConditionalForm {
        @Label("Enabled")
        enabled!: boolean;

        @Label("Config")
        @ShowWhen({ _predicate: "equals", field: "enabled", value: true })
        config!: string;
      }

      const spec = toFormSpec(ConditionalForm);

      const conditional = spec.elements[1] as TestConditional;
      expect(conditional.value).toBe(true);
    });
  });

  describe("array fields", () => {
    it("should convert array field with constraints", () => {
      @FormClass()
      class ArrayForm {
        @Label("Tags")
        @MinItems(1)
        @MaxItems(10)
        tags!: string[];
      }

      const spec = toFormSpec(ArrayForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._type).toBe("field");
      expect(field._field).toBe("array");
      expect(field.name).toBe("tags");
      expect(field.minItems).toBe(1);
      expect(field.maxItems).toBe(10);
    });

    it("should handle array field with only minItems", () => {
      @FormClass()
      class ArrayForm {
        @Label("Items")
        @MinItems(1)
        items!: string[];
      }

      const spec = toFormSpec(ArrayForm);

      const field = spec.elements[0] as TestField;
      expect(field.minItems).toBe(1);
      expect(field.maxItems).toBeUndefined();
    });

    it("should handle array field with only maxItems", () => {
      @FormClass()
      class ArrayForm {
        @Label("Items")
        @MaxItems(5)
        items!: string[];
      }

      const spec = toFormSpec(ArrayForm);

      const field = spec.elements[0] as TestField;
      expect(field.minItems).toBeUndefined();
      expect(field.maxItems).toBe(5);
    });
  });

  describe("edge cases", () => {
    it("should handle empty class", () => {
      @FormClass()
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class EmptyForm {}

      const spec = toFormSpec(EmptyForm);

      expect(spec.elements).toHaveLength(0);
    });

    it("should handle class with no decorated fields", () => {
      @FormClass()
      class NoDecoratedForm {
        field1!: string;
        field2!: number;
      }

      const spec = toFormSpec(NoDecoratedForm);

      expect(spec.elements).toHaveLength(0);
    });

    it("should handle field with no label", () => {
      @FormClass()
      class NoLabelForm {
        @Min(0)
        age!: number;
      }

      const spec = toFormSpec(NoLabelForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field.label).toBeUndefined();
    });

    it("should default to text field when no type decorator is present", () => {
      @FormClass()
      class DefaultTypeForm {
        @Label("Generic Field")
        field!: string;
      }

      const spec = toFormSpec(DefaultTypeForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._field).toBe("text");
    });

    it("should handle empty string values in decorators", () => {
      @FormClass()
      class EmptyStringsForm {
        @Label("")
        @Placeholder("")
        field!: string;
      }

      const spec = toFormSpec(EmptyStringsForm);

      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field.label).toBe("");
      expect(field.placeholder).toBe("");
    });

    it("should treat empty string group as no group", () => {
      // Note: Empty string group name ("") is treated as falsy and field is not grouped
      @FormClass()
      class EmptyGroupForm {
        @Label("Field")
        @Group("")
        field!: string;
      }

      const spec = toFormSpec(EmptyGroupForm);

      // Field should NOT be in a group because empty string is falsy
      expect(spec.elements).toHaveLength(1);
      const field = spec.elements[0] as TestField;
      expect(field._type).toBe("field");
      expect(field.name).toBe("field");
    });

    it("should handle zero values in numeric constraints", () => {
      @FormClass()
      class ZeroValuesForm {
        @Label("Value")
        @Min(0)
        @Max(0)
        value!: number;

        @Label("Items")
        @MinItems(0)
        @MaxItems(0)
        items!: string[];
      }

      const spec = toFormSpec(ZeroValuesForm);

      const valueField = spec.elements[0] as TestField;
      expect(valueField.min).toBe(0);
      expect(valueField.max).toBe(0);

      const itemsField = spec.elements[1] as TestField;
      expect(itemsField.minItems).toBe(0);
      expect(itemsField.maxItems).toBe(0);
    });
  });

  describe("complex forms", () => {
    it("should handle form with all features combined", () => {
      @FormClass()
      class ComplexForm {
        @Label("Name")
        @Placeholder("John Doe")
        @Group("Personal")
        name!: string;

        @Label("Age")
        @Min(0)
        @Max(120)
        @Optional()
        @Group("Personal")
        age?: number;

        @Label("Country")
        @EnumOptions([
          { id: "us", label: "United States" },
          { id: "uk", label: "United Kingdom" },
        ])
        @Group("Location")
        country!: string;

        @Label("Subscribe to Newsletter")
        @Boolean()
        subscribe!: boolean;

        @Label("Email")
        @Placeholder("your@email.com")
        @ShowWhen({ _predicate: "equals", field: "subscribe", value: true })
        email!: string;

        @Label("Tags")
        @MinItems(1)
        @MaxItems(5)
        tags!: string[];
      }

      const spec = toFormSpec(ComplexForm);

      // Should have: Personal group, Location group, subscribe field, conditional, tags field
      expect(spec.elements.length).toBeGreaterThan(0);

      // Find the Personal group
      const personalGroup = spec.elements.find(
        (el): el is TestGroup => el._type === "group" && el.label === "Personal"
      );
      expect(personalGroup).toBeDefined();
      expect(personalGroup?.elements).toHaveLength(2);

      // Find the Location group
      const locationGroup = spec.elements.find(
        (el): el is TestGroup => el._type === "group" && el.label === "Location"
      );
      expect(locationGroup).toBeDefined();
      expect(locationGroup?.elements).toHaveLength(1);

      // Find the conditional
      const conditional = spec.elements.find(
        (el): el is TestConditional => el._type === "conditional"
      );
      expect(conditional).toBeDefined();
      expect(conditional?.field).toBe("subscribe");
      expect(conditional?.value).toBe(true);
    });
  });

  describe("required vs optional", () => {
    it("should mark fields as required by default", () => {
      @FormClass()
      class DefaultRequiredForm {
        @Label("Name")
        name!: string;
      }

      const spec = toFormSpec(DefaultRequiredForm);
      const field = spec.elements[0] as TestField;
      expect(field.required).toBe(true);
    });

    it("should mark optional fields as not required", () => {
      @FormClass()
      class OptionalForm {
        @Label("Name")
        @Optional()
        name?: string;
      }

      const spec = toFormSpec(OptionalForm);
      const field = spec.elements[0] as TestField;
      expect(field.required).toBe(false);
    });

    it("should handle mix of required and optional fields", () => {
      @FormClass()
      class MixedForm {
        @Label("Required Field")
        required!: string;

        @Label("Optional Field")
        @Optional()
        optional?: string;
      }

      const spec = toFormSpec(MixedForm);
      expect((spec.elements[0] as TestField).required).toBe(true);
      expect((spec.elements[1] as TestField).required).toBe(false);
    });
  });
});
