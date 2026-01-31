/**
 * Tests for decorator functions.
 *
 * This suite tests each decorator individually to verify that they correctly
 * store metadata for their respective configuration options.
 */

import { describe, it, expect } from "vitest";
import { getFieldMetadata, getClassMetadata } from "../metadata.js";
import {
  FormClass,
  Label,
  Optional,
  Placeholder,
  Min,
  Max,
  EnumOptions,
  Group,
  ShowWhen,
  MinItems,
  MaxItems,
} from "../decorators.js";

describe("decorators", () => {
  describe("@FormClass()", () => {
    it("should allow class to be decorated", () => {
      @FormClass()
      class TestClass {
        field!: string;
      }

      expect(TestClass).toBeDefined();
      expect(new TestClass()).toBeInstanceOf(TestClass);
    });

    it("should work with decorated fields", () => {
      @FormClass()
      class TestClass {
        @Label("Test")
        field!: string;
      }

      new TestClass();

      const metadata = getClassMetadata(TestClass);
      expect(metadata.size).toBe(1);
    });
  });

  describe("@Label()", () => {
    it("should store label in metadata", () => {
      @FormClass()
      class TestClass {
        @Label("Field Label")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.label).toBe("Field Label");
    });

    it("should handle empty string label", () => {
      @FormClass()
      class TestClass {
        @Label("")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.label).toBe("");
    });

    it("should handle special characters in label", () => {
      @FormClass()
      class TestClass {
        @Label("Name & Email (Required)")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.label).toBe("Name & Email (Required)");
    });
  });

  describe("@Optional()", () => {
    it("should set optional flag to true", () => {
      @FormClass()
      class TestClass {
        @Optional()
        field?: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.optional).toBe(true);
    });

    it("should work with other decorators", () => {
      @FormClass()
      class TestClass {
        @Label("Optional Field")
        @Optional()
        field?: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.label).toBe("Optional Field");
      expect(metadata.optional).toBe(true);
    });
  });

  describe("@Placeholder()", () => {
    it("should store placeholder in metadata", () => {
      @FormClass()
      class TestClass {
        @Placeholder("Enter text here")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.placeholder).toBe("Enter text here");
    });

    it("should set fieldType to text", () => {
      @FormClass()
      class TestClass {
        @Placeholder("Example")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.fieldType).toBe("text");
    });

    it("should handle empty string placeholder", () => {
      @FormClass()
      class TestClass {
        @Placeholder("")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.placeholder).toBe("");
    });
  });

  describe("@Min()", () => {
    it("should store min value in metadata", () => {
      @FormClass()
      class TestClass {
        @Min(10)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.min).toBe(10);
    });

    it("should set fieldType to number", () => {
      @FormClass()
      class TestClass {
        @Min(0)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.fieldType).toBe("number");
    });

    it("should handle zero as min value", () => {
      @FormClass()
      class TestClass {
        @Min(0)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.min).toBe(0);
    });

    it("should handle negative min values", () => {
      @FormClass()
      class TestClass {
        @Min(-100)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.min).toBe(-100);
    });

    it("should handle decimal min values", () => {
      @FormClass()
      class TestClass {
        @Min(0.5)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.min).toBe(0.5);
    });
  });

  describe("@Max()", () => {
    it("should store max value in metadata", () => {
      @FormClass()
      class TestClass {
        @Max(100)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.max).toBe(100);
    });

    it("should set fieldType to number", () => {
      @FormClass()
      class TestClass {
        @Max(100)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.fieldType).toBe("number");
    });

    it("should work with @Min()", () => {
      @FormClass()
      class TestClass {
        @Min(0)
        @Max(100)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.min).toBe(0);
      expect(metadata.max).toBe(100);
    });

    it("should handle zero as max value", () => {
      @FormClass()
      class TestClass {
        @Max(0)
        field!: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.max).toBe(0);
    });
  });

  describe("@EnumOptions()", () => {
    it("should store string options in metadata", () => {
      @FormClass()
      class TestClass {
        @EnumOptions(["option1", "option2", "option3"])
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.enumOptions).toEqual(["option1", "option2", "option3"]);
    });

    it("should store object options in metadata", () => {
      @FormClass()
      class TestClass {
        @EnumOptions([
          { id: "opt1", label: "Option 1" },
          { id: "opt2", label: "Option 2" },
        ])
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.enumOptions).toEqual([
        { id: "opt1", label: "Option 1" },
        { id: "opt2", label: "Option 2" },
      ]);
    });

    it("should set fieldType to enum", () => {
      @FormClass()
      class TestClass {
        @EnumOptions(["a", "b"])
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.fieldType).toBe("enum");
    });

    it("should handle empty options array", () => {
      @FormClass()
      class TestClass {
        @EnumOptions([])
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.enumOptions).toEqual([]);
    });

    it("should handle single option", () => {
      @FormClass()
      class TestClass {
        @EnumOptions(["only"])
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.enumOptions).toEqual(["only"]);
    });
  });

  describe("@Group()", () => {
    it("should store group name in metadata", () => {
      @FormClass()
      class TestClass {
        @Group("Personal Information")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.group).toBe("Personal Information");
    });

    it("should handle empty string group name", () => {
      @FormClass()
      class TestClass {
        @Group("")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.group).toBe("");
    });

    it("should work with other decorators", () => {
      @FormClass()
      class TestClass {
        @Label("Name")
        @Group("Personal")
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.label).toBe("Name");
      expect(metadata.group).toBe("Personal");
    });
  });

  describe("@ShowWhen()", () => {
    it("should store predicate in metadata", () => {
      @FormClass()
      class TestClass {
        condition!: string;

        @ShowWhen({ _predicate: "equals", field: "condition", value: "yes" })
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.showWhen).toEqual({
        _predicate: "equals",
        field: "condition",
        value: "yes",
      });
    });

    it("should work with different value types", () => {
      @FormClass()
      class TestClass {
        count!: number;

        @ShowWhen({ _predicate: "equals", field: "count", value: 5 })
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.showWhen?.value).toBe(5);
    });

    it("should work with boolean values", () => {
      @FormClass()
      class TestClass {
        enabled!: boolean;

        @ShowWhen({ _predicate: "equals", field: "enabled", value: true })
        field!: string;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.showWhen?.value).toBe(true);
    });
  });

  describe("@MinItems()", () => {
    it("should store minItems in metadata", () => {
      @FormClass()
      class TestClass {
        @MinItems(1)
        field!: string[];
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.minItems).toBe(1);
    });

    it("should set fieldType to array", () => {
      @FormClass()
      class TestClass {
        @MinItems(1)
        field!: string[];
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.fieldType).toBe("array");
    });

    it("should handle zero as minItems", () => {
      @FormClass()
      class TestClass {
        @MinItems(0)
        field!: string[];
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.minItems).toBe(0);
    });
  });

  describe("@MaxItems()", () => {
    it("should store maxItems in metadata", () => {
      @FormClass()
      class TestClass {
        @MaxItems(10)
        field!: string[];
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.maxItems).toBe(10);
    });

    it("should set fieldType to array", () => {
      @FormClass()
      class TestClass {
        @MaxItems(10)
        field!: string[];
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.fieldType).toBe("array");
    });

    it("should work with @MinItems()", () => {
      @FormClass()
      class TestClass {
        @MinItems(1)
        @MaxItems(10)
        field!: string[];
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.minItems).toBe(1);
      expect(metadata.maxItems).toBe(10);
    });
  });

  describe("decorator combinations", () => {
    it("should handle all decorators on one field", () => {
      @FormClass()
      class TestClass {
        @Label("Age Range")
        @Min(0)
        @Max(120)
        @Optional()
        @Group("Demographics")
        age?: number;
      }

      new TestClass();

      const metadata = getFieldMetadata(TestClass, "age");
      expect(metadata).toEqual({
        label: "Age Range",
        min: 0,
        max: 120,
        optional: true,
        group: "Demographics",
        fieldType: "number",
      });
    });

    it("should handle multiple fields with different decorators", () => {
      @FormClass()
      class TestClass {
        @Label("Name")
        @Placeholder("John Doe")
        name!: string;

        @Label("Age")
        @Min(0)
        @Max(120)
        age!: number;

        @Label("Country")
        @EnumOptions(["US", "UK", "CA"])
        country!: string;
      }

      new TestClass();

      const nameMetadata = getFieldMetadata(TestClass, "name");
      expect(nameMetadata.label).toBe("Name");
      expect(nameMetadata.placeholder).toBe("John Doe");

      const ageMetadata = getFieldMetadata(TestClass, "age");
      expect(ageMetadata.label).toBe("Age");
      expect(ageMetadata.min).toBe(0);
      expect(ageMetadata.max).toBe(120);

      const countryMetadata = getFieldMetadata(TestClass, "country");
      expect(countryMetadata.label).toBe("Country");
      expect(countryMetadata.enumOptions).toEqual(["US", "UK", "CA"]);
    });
  });
});
