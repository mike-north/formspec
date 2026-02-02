/**
 * Tests for the toFormSpec() runtime API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  buildFormSchemas,
  getDecoratorMetadata,
  getTypeMetadata,
  type TypeMetadata,
} from "../index.js";

// Helper to simulate codegen output by adding __formspec_types__ to a class
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

    it("should accept record shorthand for @EnumOptions", () => {
      class TestForm {
        @Label("Role")
        @EnumOptions({ admin: "Administrator", user: "Regular User" })
        role!: "admin" | "user";
      }

      withTypeMetadata(TestForm, {
        role: { type: "enum", values: ["admin", "user"] },
      });

      const spec = toFormSpec(TestForm);

      expect(spec.elements[0]?.options).toEqual([
        { id: "admin", label: "Administrator" },
        { id: "user", label: "Regular User" },
      ]);
    });

    it("should handle empty record for @EnumOptions", () => {
      class TestForm {
        @Label("Status")
        @EnumOptions({})
        status!: "active" | "inactive";
      }

      withTypeMetadata(TestForm, {
        status: { type: "enum", values: ["active", "inactive"] },
      });

      const spec = toFormSpec(TestForm);

      // Empty record produces empty options array (decorator overrides auto-generation)
      expect(spec.elements[0]?.options).toEqual([]);
    });

    it("should preserve insertion order in record shorthand", () => {
      class TestForm {
        @Label("Priority")
        @EnumOptions({ z: "Zebra", a: "Apple", m: "Mango" })
        priority!: "z" | "a" | "m";
      }

      withTypeMetadata(TestForm, {
        priority: { type: "enum", values: ["z", "a", "m"] },
      });

      const spec = toFormSpec(TestForm);

      // Object.entries() preserves insertion order per ES2015+ spec
      expect(spec.elements[0]?.options).toEqual([
        { id: "z", label: "Zebra" },
        { id: "a", label: "Apple" },
        { id: "m", label: "Mango" },
      ]);
    });

    it("should handle enum values with special characters", () => {
      class TestForm {
        @Label("Mode")
        mode!: "user-mode" | "admin.mode" | "mode@test";
      }

      withTypeMetadata(TestForm, {
        mode: { type: "enum", values: ["user-mode", "admin.mode", "mode@test"] },
      });

      const spec = toFormSpec(TestForm);

      expect(spec.elements[0]?.options).toEqual([
        { id: "user-mode", label: "user-mode" },
        { id: "admin.mode", label: "admin.mode" },
        { id: "mode@test", label: "mode@test" },
      ]);
    });

    it("should auto-generate options for numeric enum values", () => {
      class TestForm {
        @Label("Count")
        count!: 1 | 2 | 3;
      }

      withTypeMetadata(TestForm, {
        count: { type: "enum", values: [1, 2, 3] },
      });

      const spec = toFormSpec(TestForm);

      expect(spec.elements[0]?.options).toEqual([
        { id: "1", label: "1" },
        { id: "2", label: "2" },
        { id: "3", label: "3" },
      ]);
    });

    it("should handle empty values array in enum type metadata", () => {
      class TestForm {
        @Label("Empty")
        empty!: string;
      }

      withTypeMetadata(TestForm, {
        empty: { type: "enum", values: [] },
      });

      const spec = toFormSpec(TestForm);

      expect(spec.elements[0]?.options).toEqual([]);
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
      expect(spec.elements[0]?.options).toEqual([
        { id: "active", label: "active" },
        { id: "inactive", label: "inactive" },
      ]);
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
      expect(spec.elements[0]?.required).toBe(false);
    });

    it("should mark nullable fields as not required", () => {
      class TestForm {
        @Label("Name")
        name!: string | null;
      }
      withTypeMetadata(TestForm, { name: { type: "string", nullable: true } });

      const spec = toFormSpec(TestForm);
      expect(spec.elements[0]?.required).toBe(false);
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

  it("should return empty object for class without codegen", () => {
    class TestForm {
      name!: string;
    }

    const metadata = getTypeMetadata(TestForm);
    expect(metadata).toEqual({});
  });
});

describe("missing type metadata warning", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("should emit warning when toFormSpec is called on decorated class without type metadata", () => {
    class WarnTestForm {
      @Label("Name")
      name!: string;
    }

    toFormSpec(WarnTestForm);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[FormSpec] Warning: toFormSpec(WarnTestForm) called without type metadata")
    );
  });

  it("should not emit warning for same class twice", () => {
    class WarnOnceForm {
      @Label("Name")
      name!: string;
    }

    toFormSpec(WarnOnceForm);
    toFormSpec(WarnOnceForm);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("should not emit warning when type metadata is present", () => {
    class WithMetadataForm {
      @Label("Name")
      name!: string;
    }
    withTypeMetadata(WithMetadataForm, { name: { type: "string" } });

    toFormSpec(WithMetadataForm);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should not emit warning for class without any decorators", () => {
    class PlainForm {
      name!: string;
    }
    // No decorators, no type metadata - this is likely a different use case
    // so we don't warn

    toFormSpec(PlainForm);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should include helpful instructions in warning message", () => {
    class HelpfulForm {
      @Label("Email")
      email!: string;
    }

    toFormSpec(HelpfulForm);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("formspec codegen")
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("import './__formspec_types__'")
    );
  });

  it("should emit warning when buildFormSchemas is called on decorated class without type metadata", () => {
    class BuildSchemasWarnForm {
      @Label("Name")
      name!: string;
    }

    buildFormSchemas(BuildSchemasWarnForm);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[FormSpec] Warning: buildFormSchemas(BuildSchemasWarnForm) called without type metadata")
    );
  });

  it("should only warn once per class for buildFormSchemas", () => {
    class BuildSchemasOnceForm {
      @Label("Name")
      name!: string;
    }

    buildFormSchemas(BuildSchemasOnceForm);
    buildFormSchemas(BuildSchemasOnceForm);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("buildFormSchemas with @Group", () => {
  it("should create Group elements in uiSchema for grouped fields", () => {
    class GroupedForm {
      @Group("Personal Info")
      @Label("First Name")
      firstName!: string;

      @Group("Personal Info")
      @Label("Last Name")
      lastName!: string;

      @Group("Contact")
      @Label("Email")
      email!: string;
    }

    withTypeMetadata(GroupedForm, {
      firstName: { type: "string" },
      lastName: { type: "string" },
      email: { type: "string" },
    });

    const { uiSchema } = buildFormSchemas(GroupedForm);

    expect(uiSchema.type).toBe("VerticalLayout");
    expect(uiSchema.elements).toHaveLength(2);

    // First group: Personal Info
    expect(uiSchema.elements?.[0]?.type).toBe("Group");
    expect(uiSchema.elements?.[0]?.label).toBe("Personal Info");
    expect(uiSchema.elements?.[0]?.elements).toHaveLength(2);
    expect(uiSchema.elements?.[0]?.elements?.[0]?.scope).toBe("#/properties/firstName");
    expect(uiSchema.elements?.[0]?.elements?.[1]?.scope).toBe("#/properties/lastName");

    // Second group: Contact
    expect(uiSchema.elements?.[1]?.type).toBe("Group");
    expect(uiSchema.elements?.[1]?.label).toBe("Contact");
    expect(uiSchema.elements?.[1]?.elements).toHaveLength(1);
    expect(uiSchema.elements?.[1]?.elements?.[0]?.scope).toBe("#/properties/email");
  });

  it("should put ungrouped fields directly in the layout", () => {
    class MixedForm {
      @Label("Name")
      name!: string;

      @Group("Details")
      @Label("Email")
      email!: string;

      @Label("Age")
      age!: number;
    }

    withTypeMetadata(MixedForm, {
      name: { type: "string" },
      email: { type: "string" },
      age: { type: "number" },
    });

    const { uiSchema } = buildFormSchemas(MixedForm);

    expect(uiSchema.type).toBe("VerticalLayout");
    // Should have: Control (name), Group (Details), Control (age)
    expect(uiSchema.elements).toHaveLength(3);

    expect(uiSchema.elements?.[0]?.type).toBe("Control");
    expect(uiSchema.elements?.[0]?.scope).toBe("#/properties/name");

    expect(uiSchema.elements?.[1]?.type).toBe("Group");
    expect(uiSchema.elements?.[1]?.label).toBe("Details");

    expect(uiSchema.elements?.[2]?.type).toBe("Control");
    expect(uiSchema.elements?.[2]?.scope).toBe("#/properties/age");
  });

  it("should preserve field order within groups", () => {
    class OrderedForm {
      @Group("Group A")
      @Label("Field 1")
      field1!: string;

      @Group("Group A")
      @Label("Field 2")
      field2!: string;

      @Group("Group A")
      @Label("Field 3")
      field3!: string;
    }

    withTypeMetadata(OrderedForm, {
      field1: { type: "string" },
      field2: { type: "string" },
      field3: { type: "string" },
    });

    const { uiSchema } = buildFormSchemas(OrderedForm);

    const group = uiSchema.elements?.[0];
    expect(group?.type).toBe("Group");
    expect(group?.elements?.[0]?.scope).toBe("#/properties/field1");
    expect(group?.elements?.[1]?.scope).toBe("#/properties/field2");
    expect(group?.elements?.[2]?.scope).toBe("#/properties/field3");
  });

  it("should not affect jsonSchema structure (groups are UI-only)", () => {
    class GroupedJsonForm {
      @Group("Group A")
      @Label("Name")
      name!: string;

      @Group("Group B")
      @Label("Age")
      age!: number;
    }

    withTypeMetadata(GroupedJsonForm, {
      name: { type: "string" },
      age: { type: "number" },
    });

    const { jsonSchema } = buildFormSchemas(GroupedJsonForm);

    // Groups don't affect JSON Schema - it's flat
    expect(jsonSchema.properties).toHaveProperty("name");
    expect(jsonSchema.properties).toHaveProperty("age");
    expect(jsonSchema.required).toEqual(["name", "age"]);
  });

  it("should create multiple Group elements for non-consecutive fields with same group name", () => {
    class NonConsecutiveGroupsForm {
      @Group("Section A")
      @Label("Field 1")
      field1!: string;

      @Group("Section B")
      @Label("Field 2")
      field2!: string;

      @Group("Section A") // Same name, non-consecutive
      @Label("Field 3")
      field3!: string;
    }

    withTypeMetadata(NonConsecutiveGroupsForm, {
      field1: { type: "string" },
      field2: { type: "string" },
      field3: { type: "string" },
    });

    const { uiSchema } = buildFormSchemas(NonConsecutiveGroupsForm);

    expect(uiSchema.type).toBe("VerticalLayout");
    // Should have: Group (Section A), Group (Section B), Group (Section A again)
    expect(uiSchema.elements).toHaveLength(3);

    expect(uiSchema.elements?.[0]?.type).toBe("Group");
    expect(uiSchema.elements?.[0]?.label).toBe("Section A");
    expect(uiSchema.elements?.[0]?.elements).toHaveLength(1);
    expect(uiSchema.elements?.[0]?.elements?.[0]?.scope).toBe("#/properties/field1");

    expect(uiSchema.elements?.[1]?.type).toBe("Group");
    expect(uiSchema.elements?.[1]?.label).toBe("Section B");
    expect(uiSchema.elements?.[1]?.elements).toHaveLength(1);

    expect(uiSchema.elements?.[2]?.type).toBe("Group");
    expect(uiSchema.elements?.[2]?.label).toBe("Section A");
    expect(uiSchema.elements?.[2]?.elements).toHaveLength(1);
    expect(uiSchema.elements?.[2]?.elements?.[0]?.scope).toBe("#/properties/field3");
  });
});

describe("buildFormSchemas with P4 features", () => {
  it("should include auto-generated enum options in JSON Schema oneOf", () => {
    class AutoEnumForm {
      @Label("Status")
      status!: "draft" | "published";
    }

    withTypeMetadata(AutoEnumForm, {
      status: { type: "enum", values: ["draft", "published"] },
    });

    const { jsonSchema } = buildFormSchemas(AutoEnumForm);

    // Auto-generated options should produce oneOf with matching const and title
    expect(jsonSchema.properties?.status?.oneOf).toEqual([
      { const: "draft", title: "draft" },
      { const: "published", title: "published" },
    ]);
  });

  it("should include record shorthand enum options in JSON Schema oneOf", () => {
    class RecordEnumForm {
      @Label("Role")
      @EnumOptions({ admin: "Administrator", user: "Regular User" })
      role!: "admin" | "user";
    }

    withTypeMetadata(RecordEnumForm, {
      role: { type: "enum", values: ["admin", "user"] },
    });

    const { jsonSchema } = buildFormSchemas(RecordEnumForm);

    // Record shorthand options should produce oneOf with custom titles
    expect(jsonSchema.properties?.role?.oneOf).toEqual([
      { const: "admin", title: "Administrator" },
      { const: "user", title: "Regular User" },
    ]);
  });

  it("should generate both schemas correctly with P4 features", () => {
    class CompleteP4Form {
      @Label("Country")
      @EnumOptions({ us: "United States", ca: "Canada" })
      country!: "us" | "ca";

      @Label("Plan")
      plan!: "free" | "pro";
    }

    withTypeMetadata(CompleteP4Form, {
      country: { type: "enum", values: ["us", "ca"] },
      plan: { type: "enum", values: ["free", "pro"] },
    });

    const { jsonSchema, uiSchema } = buildFormSchemas(CompleteP4Form);

    // JSON Schema
    expect(jsonSchema.properties?.country?.oneOf).toEqual([
      { const: "us", title: "United States" },
      { const: "ca", title: "Canada" },
    ]);
    expect(jsonSchema.properties?.plan?.oneOf).toEqual([
      { const: "free", title: "free" },
      { const: "pro", title: "pro" },
    ]);

    // UI Schema
    expect(uiSchema.elements).toHaveLength(2);
    expect(uiSchema.elements?.[0]?.scope).toBe("#/properties/country");
    expect(uiSchema.elements?.[1]?.scope).toBe("#/properties/plan");
  });
});
