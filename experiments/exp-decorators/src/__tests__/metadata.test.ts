/**
 * Tests for metadata storage system.
 *
 * This suite tests the low-level metadata storage mechanisms that decorators
 * use to store and retrieve field metadata.
 */

import { describe, it, expect } from "vitest";
import { getFieldMetadata, getClassMetadata } from "../metadata.js";
import { FormClass, Label, Optional, Min } from "../decorators.js";

describe("metadata storage", () => {
  describe("setFieldMetadata and getFieldMetadata", () => {
    it("should store and retrieve field metadata", () => {
      @FormClass()
      class TestClass {
        @Label("Test Label")
        field!: string;
      }

      // Create instance to trigger initializers
      new TestClass();

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata.label).toBe("Test Label");
    });

    it("should return empty object for non-existent field", () => {
      @FormClass()
      class TestClass {
        field!: string;
      }

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata).toEqual({});
    });

    it("should return empty object for non-existent class", () => {
      class TestClass {
        field!: string;
      }

      const metadata = getFieldMetadata(TestClass, "field");
      expect(metadata).toEqual({});
    });
  });

  describe("getClassMetadata", () => {
    it("should return all field metadata", () => {
      @FormClass()
      class TestClass {
        @Label("Field 1")
        field1!: string;

        @Label("Field 2")
        @Optional()
        field2?: string;
      }

      // Create instance to trigger initializers
      new TestClass();

      const metadata = getClassMetadata(TestClass);
      expect(metadata.size).toBe(2);
      expect(metadata.get("field1")).toEqual({ label: "Field 1" });
      expect(metadata.get("field2")).toEqual({ label: "Field 2", optional: true });
    });

    it("should return empty map for class with no decorated fields", () => {
      @FormClass()
      class TestClass {
        field!: string;
      }

      const metadata = getClassMetadata(TestClass);
      expect(metadata.size).toBe(0);
    });

    it("should return empty map for non-decorated class", () => {
      class TestClass {
        field!: string;
      }

      const metadata = getClassMetadata(TestClass);
      expect(metadata.size).toBe(0);
    });
  });

  describe("multiple decorators on same field", () => {
    it("should merge metadata from multiple decorators", () => {
      @FormClass()
      class TestClass {
        @Label("Age")
        @Min(0)
        @Optional()
        age?: number;
      }

      // Create instance to trigger initializers
      new TestClass();

      const metadata = getFieldMetadata(TestClass, "age");
      expect(metadata).toEqual({
        label: "Age",
        min: 0,
        optional: true,
        fieldType: "number",
      });
    });

    it("should handle multiple decorators in any order", () => {
      @FormClass()
      class TestClass {
        @Optional()
        @Min(0)
        @Label("Age")
        age?: number;
      }

      // Create instance to trigger initializers
      new TestClass();

      const metadata = getFieldMetadata(TestClass, "age");
      expect(metadata.label).toBe("Age");
      expect(metadata.min).toBe(0);
      expect(metadata.optional).toBe(true);
    });
  });

  describe("metadata isolation between classes", () => {
    it("should not share metadata between different classes", () => {
      @FormClass()
      class Class1 {
        @Label("Class 1 Field")
        field!: string;
      }

      @FormClass()
      class Class2 {
        @Label("Class 2 Field")
        field!: string;
      }

      // Create instances to trigger initializers
      new Class1();
      new Class2();

      const metadata1 = getFieldMetadata(Class1, "field");
      const metadata2 = getFieldMetadata(Class2, "field");

      expect(metadata1.label).toBe("Class 1 Field");
      expect(metadata2.label).toBe("Class 2 Field");
    });

    it("should not share metadata between fields with same name", () => {
      @FormClass()
      class TestClass {
        @Label("Field A")
        field!: string;

        @Label("Field B")
        anotherField!: string;
      }

      // Create instance to trigger initializers
      new TestClass();

      const metadata1 = getFieldMetadata(TestClass, "field");
      const metadata2 = getFieldMetadata(TestClass, "anotherField");

      expect(metadata1.label).toBe("Field A");
      expect(metadata2.label).toBe("Field B");
    });
  });

  describe("edge cases", () => {
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
  });
});
