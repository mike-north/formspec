/**
 * Tests for the compiler module.
 *
 * The compiler handles:
 * - TypeScript transpilation
 * - Code execution with mock module system
 * - FormSpec schema generation
 * - Constraint validation
 */

import { describe, it, expect } from "vitest";
import { compileFormSpec, type CompileResult } from "../compiler";

/**
 * Helper to assert compilation success.
 */
function expectSuccess(result: CompileResult): asserts result is Extract<CompileResult, { success: true }> {
  if (!result.success) {
    throw new Error(`Expected success but got errors: ${result.errors.map((e) => e.message).join(", ")}`);
  }
}

/**
 * Helper to assert compilation failure.
 */
function expectFailure(result: CompileResult): asserts result is Extract<CompileResult, { success: false }> {
  if (result.success) {
    throw new Error("Expected failure but got success");
  }
}

describe("compileFormSpec", () => {
  describe("positive tests - successful compilation", () => {
    it("compiles a simple FormSpec with text field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name")
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.formSpec).toBeDefined();
      expect(result.jsonSchema).toBeDefined();
      expect(result.uiSchema).toBeDefined();
    });

    it("compiles FormSpec with multiple field types", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name"),
          field.number("age"),
          field.boolean("active")
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      // Verify JSON Schema has properties for all fields
      expect(result.jsonSchema.properties).toHaveProperty("name");
      expect(result.jsonSchema.properties).toHaveProperty("age");
      expect(result.jsonSchema.properties).toHaveProperty("active");
    });

    it("compiles FormSpec with enum field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.enum("status", ["draft", "published", "archived"])
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      const statusSchema = result.jsonSchema.properties?.status as { enum?: string[] } | undefined;
      expect(statusSchema?.enum).toEqual(["draft", "published", "archived"]);
    });

    it("compiles FormSpec with group", () => {
      const code = `
        import { field, formspec, group } from "@formspec/dsl";
        export default formspec(
          group("Contact Info",
            field.text("email"),
            field.text("phone")
          )
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.jsonSchema.properties).toHaveProperty("email");
      expect(result.jsonSchema.properties).toHaveProperty("phone");
    });

    it("compiles FormSpec with object field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.object("address",
            field.text("street"),
            field.text("city")
          )
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      const addressSchema = result.jsonSchema.properties?.address as { properties?: Record<string, unknown> } | undefined;
      expect(addressSchema?.properties).toHaveProperty("street");
      expect(addressSchema?.properties).toHaveProperty("city");
    });

    it("compiles FormSpec with array field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.array("tags",
            field.text("tag")
          )
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.jsonSchema.properties).toHaveProperty("tags");
    });

    it("compiles FormSpec with when conditional", () => {
      const code = `
        import { field, formspec, when, is } from "@formspec/dsl";
        export default formspec(
          field.boolean("hasAddress"),
          when(is("hasAddress", true),
            field.text("address")
          )
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.jsonSchema.properties).toHaveProperty("hasAddress");
      expect(result.jsonSchema.properties).toHaveProperty("address");
    });
  });

  describe("negative tests - compilation errors", () => {
    it("returns error for code without default export", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        const form = formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectFailure(result);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain("export");
    });

    it("returns error for non-FormSpec default export", () => {
      const code = `
        export default { notAFormSpec: true };
      `;

      const result = compileFormSpec(code);
      expectFailure(result);

      expect(result.errors[0]?.message).toContain("FormSpec");
    });

    it("returns error for TypeScript syntax errors", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name"
        ); // Missing closing paren
      `;

      const result = compileFormSpec(code);
      expectFailure(result);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns error for unavailable module import", () => {
      const code = `
        import { something } from "nonexistent-module";
        something(); // Force the import to be used
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectFailure(result);

      expect(result.errors[0]?.message).toContain("not available");
    });

    it("returns error for runtime errors in code", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        const x = null;
        x.foo; // Runtime error
        export default formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectFailure(result);

      expect(result.errors[0]?.message).toContain("Runtime error");
    });
  });

  describe("import syntax variations", () => {
    it("handles named imports", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles namespace import", () => {
      const code = `
        import * as dsl from "@formspec/dsl";
        export default dsl.formspec(dsl.field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles aliased imports", () => {
      const code = `
        import { field as f, formspec as fs } from "@formspec/dsl";
        export default fs(f.text("name"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles import from 'formspec' package", () => {
      const code = `
        import { field, formspec } from "formspec";
        export default formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });
  });

  describe("export syntax variations", () => {
    it("handles export default formspec(...)", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles const + export default", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        const myForm = formspec(field.text("name"));
        export default myForm;
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles export { form as default }", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        const form = formspec(field.text("name"));
        export { form as default };
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });
  });

  describe("edge cases", () => {
    it("handles empty FormSpec", () => {
      const code = `
        import { formspec } from "@formspec/dsl";
        export default formspec();
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.formSpec.elements).toHaveLength(0);
    });

    it("handles code with comments", () => {
      const code = `
        // This is a comment
        import { field, formspec } from "@formspec/dsl";
        /* Multi-line
           comment */
        export default formspec(
          field.text("name") // inline comment
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles code with extra whitespace", () => {
      const code = `


        import { field, formspec } from "@formspec/dsl";

        export default formspec(

          field.text("name")

        );

      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles deeply nested structures", () => {
      const code = `
        import { field, formspec, group } from "@formspec/dsl";
        export default formspec(
          group("Level 1",
            group("Level 2",
              group("Level 3",
                field.text("deepField")
              )
            )
          )
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);
    });

    it("handles field with all options", () => {
      // DSL uses config objects, not chained methods
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name", {
            label: "Full Name",
            description: "Enter your full legal name",
            required: true
          })
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      // Verify the field was created with the right type
      const nameSchema = result.jsonSchema.properties?.name as { type?: string } | undefined;
      expect(nameSchema?.type).toBe("string");
      // Verify it's required
      expect(result.jsonSchema.required).toContain("name");
    });
  });

  describe("constraint validation", () => {
    it("passes when all field types are allowed", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name"),
          field.number("age")
        );
      `;

      const result = compileFormSpec(code, {
        constraints: {
          fieldTypes: {
            text: "off",
            number: "off",
          },
        },
      });

      expectSuccess(result);
    });

    it("fails when forbidden field type is used", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name"),
          field.dynamicEnum("status", "fetchStatuses")
        );
      `;

      const result = compileFormSpec(code, {
        constraints: {
          fieldTypes: {
            text: "off",
            dynamicEnum: "error",
          },
        },
      });

      expectFailure(result);
      expect(result.errors.some((e) => e.message.toLowerCase().includes("dynamic"))).toBe(true);
    });

    it("fails when forbidden group is used", () => {
      const code = `
        import { field, formspec, group } from "@formspec/dsl";
        export default formspec(
          group("Contact",
            field.text("name")
          )
        );
      `;

      const result = compileFormSpec(code, {
        constraints: {
          layout: {
            group: "error",
          },
        },
      });

      expectFailure(result);
    });

    it("includes line numbers in constraint errors when possible", () => {
      const code = `import { field, formspec } from "@formspec/dsl";
export default formspec(
  field.dynamicEnum("status", "fetchStatuses")
);`;

      const result = compileFormSpec(code, {
        constraints: {
          fieldTypes: {
            dynamicEnum: "error",
          },
        },
      });

      expectFailure(result);
      // Line number should be present for field-specific errors
      const hasLineNumber = result.errors.some((e) => e.line !== undefined);
      expect(hasLineNumber).toBe(true);
    });
  });

  describe("schema generation", () => {
    it("generates correct JSON Schema type for text field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      const nameSchema = result.jsonSchema.properties?.name as { type?: string } | undefined;
      expect(nameSchema?.type).toBe("string");
    });

    it("generates correct JSON Schema type for number field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.number("count"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      const countSchema = result.jsonSchema.properties?.count as { type?: string } | undefined;
      expect(countSchema?.type).toBe("number");
    });

    it("generates correct JSON Schema type for boolean field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.boolean("active"));
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      const activeSchema = result.jsonSchema.properties?.active as { type?: string } | undefined;
      expect(activeSchema?.type).toBe("boolean");
    });

    it("generates UI Schema with controls", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("firstName"),
          field.text("lastName")
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.uiSchema).toBeDefined();
      expect(result.uiSchema.type).toBe("VerticalLayout");
    });

    it("marks required fields in JSON Schema", () => {
      // DSL uses config objects, not chained methods
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("requiredField", { required: true }),
          field.text("optional")
        );
      `;

      const result = compileFormSpec(code);
      expectSuccess(result);

      expect(result.jsonSchema.required).toContain("requiredField");
      expect(result.jsonSchema.required).not.toContain("optional");
    });
  });
});
