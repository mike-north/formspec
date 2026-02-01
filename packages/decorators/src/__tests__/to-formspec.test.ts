/**
 * Tests for the toFormSpec() runtime API.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  Label,
  Placeholder,
  Description,
  Min,
  Max,
  Step,
  MinLength,
  MaxLength,
  MinItems,
  MaxItems,
  Pattern,
  EnumOptions,
  ShowWhen,
  Group,
  toFormSpec,
  getDecoratorMetadata,
  getTypeMetadata,
  type TypeMetadata,
} from "../index.js";

// Helper to simulate transformer output by adding __formspec_types__ to a class
function withTypeMetadata<T extends new (...args: unknown[]) => unknown>(
  ctor: T,
  metadata: Record<string, TypeMetadata>
): T {
  (ctor as Record<string, unknown>).__formspec_types__ = metadata;
  return ctor;
}

describe("toFormSpec", () => {
  describe("basic functionality", () => {
    it("should convert class with type metadata to FormSpec", () => {
      class TestForm {
        @Label("Name")
        name!: string;
      }

      withTypeMetadata(TestForm, {
        name: { type: "string" },
      });

      const spec = toFormSpec(TestForm);

      expect(spec.elements).toHaveLength(1);
      expect(spec.elements[0]).toEqual({
        _field: "text",
        id: "name",
        label: "Name",
        required: true,
      });
    });

    it("should handle class with no type metadata (decorator-only mode)", () => {
      class TestForm {
        @Label("Name")
        name!: string;
      }

      const spec = toFormSpec(TestForm);

      // Falls back to "unknown" type when no __formspec_types__
      expect(spec.elements).toHaveLength(1);
      expect(spec.elements[0]?._field).toBe("text"); // unknown maps to text
      expect(spec.elements[0]?.label).toBe("Name");
    });

    it("should prefer decorator options over type values", () => {
      class TestForm {
        @Label("Country")
        @EnumOptions([
          { id: "us", label: "United States" },
          { id: "ca", label: "Canada" },
        ])
        country!: "us" | "ca";
      }

      withTypeMetadata(TestForm, {
        country: { type: "enum", values: ["us", "ca"] },
      });

      const spec = toFormSpec(TestForm);

      expect(spec.elements[0]?.options).toEqual([
        { id: "us", label: "United States" },
        { id: "ca", label: "Canada" },
      ]);
    });
  });

  describe("field type mapping", () => {
    it("should map string type to text field", () => {
      class TestForm {
        @Label("Name")
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("text");
    });

    it("should map number type to number field", () => {
      class TestForm {
        @Label("Age")
        age!: number;
      }
      withTypeMetadata(TestForm, { age: { type: "number" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("number");
    });

    it("should map boolean type to boolean field", () => {
      class TestForm {
        @Label("Active")
        active!: boolean;
      }
      withTypeMetadata(TestForm, { active: { type: "boolean" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("boolean");
    });

    it("should map enum type to enum field", () => {
      class TestForm {
        @Label("Status")
        status!: "active" | "inactive";
      }
      withTypeMetadata(TestForm, {
        status: { type: "enum", values: ["active", "inactive"] },
      });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("enum");
      expect(spec.elements[0]?.options).toEqual(["active", "inactive"]);
    });

    it("should map array type to array field", () => {
      class TestForm {
        @Label("Tags")
        tags!: string[];
      }
      withTypeMetadata(TestForm, {
        tags: { type: "array", itemType: { type: "string" } },
      });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("array");
    });

    it("should map object type to object field with nested fields", () => {
      class TestForm {
        @Label("Address")
        address!: { street: string; city: string };
      }
      withTypeMetadata(TestForm, {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
        },
      });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("object");
      expect(spec.elements[0]?.fields).toHaveLength(2);
      expect(spec.elements[0]?.fields?.[0]).toEqual({
        _field: "text",
        id: "street",
        required: true,
      });
    });

    it("should map unknown type to text field", () => {
      class TestForm {
        @Label("Data")
        data!: unknown;
      }
      withTypeMetadata(TestForm, { data: { type: "unknown" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?._field).toBe("text");
    });
  });

  describe("required field handling", () => {
    it("should mark non-optional, non-nullable fields as required", () => {
      class TestForm {
        @Label("Name")
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.required).toBe(true);
    });

    it("should mark optional fields as not required", () => {
      class TestForm {
        @Label("Name")
        name?: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string", optional: true } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.required).toBeUndefined();
    });

    it("should mark nullable fields as not required", () => {
      class TestForm {
        @Label("Name")
        name!: string | null;
      }
      withTypeMetadata(TestForm, { name: { type: "string", nullable: true } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.required).toBeUndefined();
    });
  });

  describe("decorator metadata application", () => {
    it("should apply label from decorator", () => {
      class TestForm {
        @Label("Full Name")
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.label).toBe("Full Name");
    });

    it("should apply placeholder from decorator", () => {
      class TestForm {
        @Label("Name")
        @Placeholder("Enter your name...")
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.placeholder).toBe("Enter your name...");
    });

    it("should apply description from decorator", () => {
      class TestForm {
        @Label("Name")
        @Description("Your legal name")
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.description).toBe("Your legal name");
    });

    it("should apply numeric constraints from decorators", () => {
      class TestForm {
        @Label("Age")
        @Min(18)
        @Max(120)
        @Step(1)
        age!: number;
      }
      withTypeMetadata(TestForm, { age: { type: "number" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.min).toBe(18);
      expect(spec.elements[0]?.max).toBe(120);
      expect(spec.elements[0]?.step).toBe(1);
    });

    it("should apply string constraints from decorators", () => {
      class TestForm {
        @Label("Username")
        @MinLength(3)
        @MaxLength(20)
        @Pattern("^[a-z]+$")
        username!: string;
      }
      withTypeMetadata(TestForm, { username: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.minLength).toBe(3);
      expect(spec.elements[0]?.maxLength).toBe(20);
      expect(spec.elements[0]?.pattern).toBe("^[a-z]+$");
    });

    it("should apply array constraints from decorators", () => {
      class TestForm {
        @Label("Tags")
        @MinItems(1)
        @MaxItems(10)
        tags!: string[];
      }
      withTypeMetadata(TestForm, {
        tags: { type: "array", itemType: { type: "string" } },
      });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.minItems).toBe(1);
      expect(spec.elements[0]?.maxItems).toBe(10);
    });

    it("should apply showWhen condition from decorator", () => {
      class TestForm {
        @Label("Type")
        type!: "a" | "b";

        @Label("Extra")
        @ShowWhen({ field: "type", value: "a" })
        extra?: string;
      }
      withTypeMetadata(TestForm, {
        type: { type: "enum", values: ["a", "b"] },
        extra: { type: "string", optional: true },
      });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[1]?.showWhen).toEqual({ field: "type", value: "a" });
    });

    it("should apply group from decorator", () => {
      class TestForm {
        @Group("Personal")
        @Label("Name")
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.group).toBe("Personal");
    });
  });

  describe("negative tests", () => {
    it("should handle class with no __formspec_types__", () => {
      class TestForm {
        @Label("Name")
        name!: string;
      }

      // No withTypeMetadata call
      const spec = toFormSpec(TestForm);
      expect(spec.elements).toHaveLength(1);
    });

    it("should handle class with empty __formspec_types__", () => {
      class TestForm {
        @Label("Name")
        name!: string;
      }
      withTypeMetadata(TestForm, {});

      const spec = toFormSpec(TestForm);
      // Falls back to decorator metadata
      expect(spec.elements).toHaveLength(1);
    });

    it("should handle class with no decorators", () => {
      class TestForm {
        name!: string;
      }
      withTypeMetadata(TestForm, { name: { type: "string" } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements).toHaveLength(1);
      expect(spec.elements[0]?.label).toBeUndefined();
    });
  });
});

describe("getDecoratorMetadata", () => {
  it("should return decorator metadata for a class", () => {
    class TestForm {
      @Label("Name")
      @Min(0)
      name!: string;
    }

    const metadata = getDecoratorMetadata(TestForm);

    expect(metadata.get("name")).toEqual({
      label: "Name",
      min: 0,
    });
  });

  it("should return empty map for class with no decorators", () => {
    class TestForm {
      name!: string;
    }

    const metadata = getDecoratorMetadata(TestForm);
    expect(metadata.size).toBe(0);
  });
});

describe("getTypeMetadata", () => {
  it("should return type metadata from __formspec_types__", () => {
    class TestForm {
      name!: string;
    }
    withTypeMetadata(TestForm, { name: { type: "string" } });

    const metadata = getTypeMetadata(TestForm);
    expect(metadata).toEqual({ name: { type: "string" } });
  });

  it("should return empty object for class without transformer", () => {
    class TestForm {
      name!: string;
    }

    const metadata = getTypeMetadata(TestForm);
    expect(metadata).toEqual({});
  });
});
