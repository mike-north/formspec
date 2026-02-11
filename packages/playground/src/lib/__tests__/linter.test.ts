/**
 * Tests for the ESLint linter module.
 *
 * The linter runs real @formspec/eslint-plugin rules in the browser
 * to validate FormSpec code against constraints.
 */

import { describe, it, expect } from "vitest";
import { lintFormSpec } from "../linter";
import type { ConstraintsConfig } from "../../components/Constraints";

/**
 * Creates a test constraints config with all fields allowed by default.
 */
function createAllowedConfig(overrides: Partial<{
  fieldTypes: Partial<ConstraintsConfig["fieldTypes"]>;
  layout: Partial<ConstraintsConfig["layout"]>;
}> = {}): ConstraintsConfig {
  return {
    fieldTypes: {
      text: true,
      number: true,
      boolean: true,
      enum: true,
      dynamicEnum: true,
      dynamicSchema: true,
      array: true,
      object: true,
      ...overrides.fieldTypes,
    },
    layout: {
      group: true,
      when: true,
      maxNestingDepth: 5,
      ...overrides.layout,
    },
  };
}

/**
 * Sample FormSpec code for testing.
 */
const SAMPLE_CODE = `
import { field, formspec, group, when, is } from "@formspec/dsl";

export default formspec(
  field.text("name"),
  field.number("age"),
  field.boolean("active"),
  field.enum("status", ["draft", "published"]),
  group("Contact",
    field.text("email"),
    field.text("phone")
  ),
  when(is("active", true),
    field.text("activeSince")
  )
);
`;

describe("lintFormSpec", () => {
  describe("positive tests - no violations", () => {
    it("returns empty array when all constraints are allowed", () => {
      const constraints = createAllowedConfig();
      const result = lintFormSpec(SAMPLE_CODE, constraints);

      expect(result).toEqual([]);
    });

    it("returns empty array for code without field definitions", () => {
      const code = `
        const x = 1;
        const y = 2;
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });
      const result = lintFormSpec(code, constraints);

      expect(result).toEqual([]);
    });

    it("returns empty array for empty code", () => {
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });
      const result = lintFormSpec("", constraints);

      expect(result).toEqual([]);
    });
  });

  describe("negative tests - field type violations", () => {
    it("detects disallowed text field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("text");
    });

    it("detects disallowed number field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.number("age"));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { number: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("number");
    });

    it("detects disallowed boolean field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.boolean("active"));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { boolean: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("boolean");
    });

    it("detects disallowed enum field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.enum("status", ["a", "b"]));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { enum: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("enum");
    });

    it("detects disallowed dynamicEnum field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.dynamicEnum("status", "fetchStatuses"));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { dynamicEnum: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("dynamic");
    });

    it("detects disallowed array field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.array("items", field.text("item")));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { array: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("array");
    });

    it("detects disallowed object field", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.object("address", field.text("street")));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { object: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("object");
    });
  });

  describe("negative tests - layout violations", () => {
    it("detects disallowed group", () => {
      const code = `
        import { field, formspec, group } from "@formspec/dsl";
        export default formspec(
          group("Contact",
            field.text("name")
          )
        );
      `;
      const constraints = createAllowedConfig({ layout: { group: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("group");
    });

    it("detects disallowed when conditional", () => {
      const code = `
        import { field, formspec, when, is } from "@formspec/dsl";
        export default formspec(
          field.boolean("active"),
          when(is("active", true),
            field.text("details")
          )
        );
      `;
      const constraints = createAllowedConfig({ layout: { when: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.message.toLowerCase()).toContain("when");
    });
  });

  describe("multiple violations", () => {
    it("detects multiple field type violations", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name"),
          field.text("email"),
          field.number("age")
        );
      `;
      const constraints = createAllowedConfig({
        fieldTypes: { text: false, number: false },
      });

      const result = lintFormSpec(code, constraints);

      // Should detect all violations
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("detects both field type and layout violations", () => {
      const code = `
        import { field, formspec, group } from "@formspec/dsl";
        export default formspec(
          group("Section",
            field.text("name")
          )
        );
      `;
      const constraints = createAllowedConfig({
        fieldTypes: { text: false },
        layout: { group: false },
      });

      const result = lintFormSpec(code, constraints);

      // Should detect both types of violations
      const hasTextViolation = result.some((m) => m.message.toLowerCase().includes("text"));
      const hasGroupViolation = result.some((m) => m.message.toLowerCase().includes("group"));

      expect(hasTextViolation).toBe(true);
      expect(hasGroupViolation).toBe(true);
    });
  });

  describe("lint message properties", () => {
    it("includes line number in lint message", () => {
      const code = `import { field, formspec } from "@formspec/dsl";
export default formspec(
  field.text("name")
);`;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.line).toBeGreaterThan(0);
    });

    it("includes column number in lint message", () => {
      const code = `import { field, formspec } from "@formspec/dsl";
export default formspec(field.text("name"));`;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.column).toBeGreaterThan(0);
    });

    it("sets severity to error for restricted fields", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.severity).toBe("error");
    });

    it("includes rule ID in lint message", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      const result = lintFormSpec(code, constraints);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.ruleId).toContain("@formspec");
    });
  });

  describe("edge cases", () => {
    it("handles parser errors gracefully", () => {
      const invalidCode = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.text("name"
        ); // Syntax error - missing closing paren
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      // Should not throw, just return empty (let compiler handle syntax errors)
      const result = lintFormSpec(invalidCode, constraints);
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles code with only imports", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      const result = lintFormSpec(code, constraints);
      expect(result).toEqual([]);
    });

    it("handles code with field-like method names that are not FormSpec", () => {
      const code = `
        const notFormSpec = {
          field: {
            text: (name) => name // Not actual FormSpec
          }
        };
        notFormSpec.field.text("name");
      `;
      const constraints = createAllowedConfig({ fieldTypes: { text: false } });

      // This might or might not trigger - depends on rule implementation
      // The important thing is it doesn't crash
      const result = lintFormSpec(code, constraints);
      expect(Array.isArray(result)).toBe(true);
    });

    it("handles arrayWithConfig and objectWithConfig variants", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(
          field.arrayWithConfig("items", { minItems: 1 }, field.text("item")),
          field.objectWithConfig("address", { additionalProperties: false }, field.text("street"))
        );
      `;
      const constraints = createAllowedConfig({
        fieldTypes: { array: false, object: false },
      });

      const result = lintFormSpec(code, constraints);

      // Both arrayWithConfig and objectWithConfig should be flagged
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("selective constraints", () => {
    it("only lints when at least one constraint is active", () => {
      const code = `
        import { field, formspec } from "@formspec/dsl";
        export default formspec(field.text("name"));
      `;

      // All allowed - no linting needed
      const allAllowed = createAllowedConfig();
      const result1 = lintFormSpec(code, allAllowed);
      expect(result1).toEqual([]);

      // One forbidden - linting runs
      const oneRestricted = createAllowedConfig({ fieldTypes: { text: false } });
      const result2 = lintFormSpec(code, oneRestricted);
      expect(result2.length).toBeGreaterThan(0);
    });

    it("respects independent field type and layout restrictions", () => {
      const codeWithGroup = `
        import { field, formspec, group } from "@formspec/dsl";
        export default formspec(
          group("Section",
            field.text("name")
          )
        );
      `;

      // Only text restricted - group should be allowed
      const textRestricted = createAllowedConfig({ fieldTypes: { text: false } });
      const result1 = lintFormSpec(codeWithGroup, textRestricted);
      const hasGroupViolation = result1.some((m) => m.message.toLowerCase().includes("group"));
      expect(hasGroupViolation).toBe(false);

      // Only group restricted - text should be allowed
      const groupRestricted = createAllowedConfig({ layout: { group: false } });
      const result2 = lintFormSpec(codeWithGroup, groupRestricted);
      const hasTextViolation = result2.some((m) => m.message.toLowerCase().includes("text"));
      expect(hasTextViolation).toBe(false);
    });
  });
});
