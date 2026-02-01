import { describe, it, expect } from "vitest";
import { field, group, when, is, formspec } from "../index.js";

describe("field builders", () => {
  describe("field.text", () => {
    it("should create a text field with required properties", () => {
      const f = field.text("name");

      expect(f._type).toBe("field");
      expect(f._field).toBe("text");
      expect(f.name).toBe("name");
    });

    it("should include optional config properties", () => {
      const f = field.text("name", {
        label: "Full Name",
        placeholder: "Enter your name",
        required: true,
      });

      expect(f.label).toBe("Full Name");
      expect(f.placeholder).toBe("Enter your name");
      expect(f.required).toBe(true);
    });
  });

  describe("field.number", () => {
    it("should create a number field with required properties", () => {
      const f = field.number("age");

      expect(f._type).toBe("field");
      expect(f._field).toBe("number");
      expect(f.name).toBe("age");
    });

    it("should include min/max constraints", () => {
      const f = field.number("age", { min: 0, max: 150 });

      expect(f.min).toBe(0);
      expect(f.max).toBe(150);
    });
  });

  describe("field.boolean", () => {
    it("should create a boolean field", () => {
      const f = field.boolean("active");

      expect(f._type).toBe("field");
      expect(f._field).toBe("boolean");
      expect(f.name).toBe("active");
    });
  });

  describe("field.enum", () => {
    it("should create an enum field with options", () => {
      const f = field.enum("status", ["draft", "sent", "paid"] as const);

      expect(f._type).toBe("field");
      expect(f._field).toBe("enum");
      expect(f.name).toBe("status");
      expect(f.options).toEqual(["draft", "sent", "paid"]);
    });

    it("should include optional config", () => {
      const f = field.enum("status", ["draft", "sent"] as const, {
        label: "Status",
        required: true,
      });

      expect(f.label).toBe("Status");
      expect(f.required).toBe(true);
    });

    it("should create an enum field with object options", () => {
      const f = field.enum("priority", [
        { id: "low", label: "Low Priority" },
        { id: "medium", label: "Medium Priority" },
        { id: "high", label: "High Priority" },
      ] as const);

      expect(f._type).toBe("field");
      expect(f._field).toBe("enum");
      expect(f.name).toBe("priority");
      expect(f.options).toEqual([
        { id: "low", label: "Low Priority" },
        { id: "medium", label: "Medium Priority" },
        { id: "high", label: "High Priority" },
      ]);
    });

    it("should include optional config with object options", () => {
      const f = field.enum("priority", [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ] as const, {
        label: "Priority",
        required: true,
      });

      expect(f.label).toBe("Priority");
      expect(f.required).toBe(true);
    });

    it("should handle empty options array", () => {
      const f = field.enum("empty", [] as const);

      expect(f._field).toBe("enum");
      expect(f.options).toEqual([]);
    });

    it("should throw error for mixed string and object options", () => {
      expect(() => {
        // Using 'as any' to bypass type checking for runtime validation test
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        field.enum("mixed", ["string", { id: "obj", label: "Object" }] as any);
      }).toThrow(/options must be all strings or all objects/);
    });

    it("should throw error for object options missing id", () => {
      expect(() => {
        // @ts-expect-error - intentionally testing invalid object
        field.enum("invalid", [{ label: "No ID" }]);
      }).toThrow(/object options must have string "id" and "label"/);
    });

    it("should throw error for object options missing label", () => {
      expect(() => {
        // @ts-expect-error - intentionally testing invalid object
        field.enum("invalid", [{ id: "missing-label" }]);
      }).toThrow(/object options must have string "id" and "label"/);
    });

    it("should throw error for object options with non-string id", () => {
      expect(() => {
        // @ts-expect-error - intentionally testing invalid object
        field.enum("invalid", [{ id: 123, label: "Number ID" }]);
      }).toThrow(/object options must have string "id" and "label"/);
    });

    it("should throw error for object options with non-string label", () => {
      expect(() => {
        // @ts-expect-error - intentionally testing invalid object
        field.enum("invalid", [{ id: "valid", label: 456 }]);
      }).toThrow(/object options must have string "id" and "label"/);
    });
  });

  describe("field.dynamicEnum", () => {
    it("should create a dynamic enum field with source", () => {
      const f = field.dynamicEnum("country", "countries");

      expect(f._type).toBe("field");
      expect(f._field).toBe("dynamic_enum");
      expect(f.name).toBe("country");
      expect(f.source).toBe("countries");
    });

    it("should include params for dependent lookups", () => {
      const f = field.dynamicEnum("city", "cities", {
        params: ["country"],
      });

      expect(f.params).toEqual(["country"]);
    });
  });

  describe("field.dynamicSchema", () => {
    it("should create a dynamic schema field", () => {
      const f = field.dynamicSchema("extension", "payment-extension");

      expect(f._type).toBe("field");
      expect(f._field).toBe("dynamic_schema");
      expect(f.name).toBe("extension");
      expect(f.schemaSource).toBe("payment-extension");
    });
  });

  describe("field.array", () => {
    it("should create an array field with item schema", () => {
      const f = field.array(
        "addresses",
        field.text("street"),
        field.text("city"),
      );

      expect(f._type).toBe("field");
      expect(f._field).toBe("array");
      expect(f.name).toBe("addresses");
      expect(f.items).toHaveLength(2);
      expect(f.items[0]._field).toBe("text");
      expect(f.items[1]._field).toBe("text");
    });
  });

  describe("field.arrayWithConfig", () => {
    it("should create an array field with config", () => {
      const f = field.arrayWithConfig(
        "items",
        { label: "Line Items", minItems: 1, maxItems: 10 },
        field.text("description"),
      );

      expect(f.label).toBe("Line Items");
      expect(f.minItems).toBe(1);
      expect(f.maxItems).toBe(10);
    });
  });

  describe("field.object", () => {
    it("should create an object field with properties", () => {
      const f = field.object(
        "address",
        field.text("street"),
        field.text("city"),
        field.text("zip"),
      );

      expect(f._type).toBe("field");
      expect(f._field).toBe("object");
      expect(f.name).toBe("address");
      expect(f.properties).toHaveLength(3);
    });
  });

  describe("field.objectWithConfig", () => {
    it("should create an object field with config", () => {
      const f = field.objectWithConfig(
        "billing",
        { label: "Billing Address", required: true },
        field.text("street"),
      );

      expect(f.label).toBe("Billing Address");
      expect(f.required).toBe(true);
    });
  });
});

describe("structure builders", () => {
  describe("group", () => {
    it("should create a group with label and elements", () => {
      const g = group(
        "Customer Info",
        field.text("name"),
        field.text("email"),
      );

      expect(g._type).toBe("group");
      expect(g.label).toBe("Customer Info");
      expect(g.elements).toHaveLength(2);
    });
  });

  describe("when", () => {
    it("should create a conditional with predicate and elements", () => {
      const c = when(
        is("country", "US"),
        field.text("state"),
      );

      expect(c._type).toBe("conditional");
      expect(c.field).toBe("country");
      expect(c.value).toBe("US");
      expect(c.elements).toHaveLength(1);
    });

    it("should support non-string values", () => {
      const c = when(is("active", true), field.text("notes"));

      expect(c.value).toBe(true);
    });
  });

  describe("formspec", () => {
    it("should create a form spec with elements", () => {
      const f = formspec(
        field.text("name"),
        field.number("age"),
      );

      expect(f.elements).toHaveLength(2);
    });

    it("should support nested structures", () => {
      const f = formspec(
        group("Basic",
          field.text("name"),
        ),
        when(is("type", "business"),
          field.text("company"),
        ),
      );

      expect(f.elements).toHaveLength(2);
      expect(f.elements[0]._type).toBe("group");
      expect(f.elements[1]._type).toBe("conditional");
    });
  });
});

describe("complex compositions", () => {
  it("should support deeply nested structures", () => {
    const form = formspec(
      group("Customer",
        field.text("name", { required: true }),
        field.object("address",
          field.text("street"),
          field.text("city"),
        ),
      ),
      when(is("type", "business"),
        group("Business Info",
          field.text("company"),
          field.array("contacts",
            field.text("name"),
            field.text("email"),
          ),
        ),
      ),
    );

    expect(form.elements).toHaveLength(2);

    const customerGroup = form.elements[0];
    expect(customerGroup._type).toBe("group");
    if (customerGroup._type === "group") {
      expect(customerGroup.elements).toHaveLength(2);
      expect(customerGroup.elements[1]._type).toBe("field");
    }
  });
});
