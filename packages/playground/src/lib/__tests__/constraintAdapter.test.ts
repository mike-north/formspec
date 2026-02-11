/**
 * Tests for the constraint adapter module.
 *
 * The constraint adapter converts between playground UI config (booleans)
 * and @formspec/constraints config (Severity strings).
 */

import { describe, it, expect } from "vitest";
import { toConstraintConfig, hasActiveConstraints } from "../constraintAdapter";
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
 * Creates a test constraints config with all fields forbidden.
 */
function createForbiddenConfig(): ConstraintsConfig {
  return {
    fieldTypes: {
      text: false,
      number: false,
      boolean: false,
      enum: false,
      dynamicEnum: false,
      dynamicSchema: false,
      array: false,
      object: false,
    },
    layout: {
      group: false,
      when: false,
      maxNestingDepth: 0,
    },
  };
}

describe("toConstraintConfig", () => {
  describe("positive tests - allowed field types", () => {
    it("converts all-allowed config to all 'off' severities", () => {
      const uiConfig = createAllowedConfig();
      const result = toConstraintConfig(uiConfig);

      expect(result.fieldTypes?.text).toBe("off");
      expect(result.fieldTypes?.number).toBe("off");
      expect(result.fieldTypes?.boolean).toBe("off");
      expect(result.fieldTypes?.staticEnum).toBe("off");
      expect(result.fieldTypes?.dynamicEnum).toBe("off");
      expect(result.fieldTypes?.dynamicSchema).toBe("off");
      expect(result.fieldTypes?.array).toBe("off");
      expect(result.fieldTypes?.object).toBe("off");
    });

    it("converts all-allowed layout config to 'off' severities", () => {
      const uiConfig = createAllowedConfig();
      const result = toConstraintConfig(uiConfig);

      expect(result.layout?.group).toBe("off");
      expect(result.layout?.conditionals).toBe("off");
    });

    it("preserves maxNestingDepth as-is", () => {
      const uiConfig = createAllowedConfig({ layout: { maxNestingDepth: 10 } });
      const result = toConstraintConfig(uiConfig);

      expect(result.layout?.maxNestingDepth).toBe(10);
    });
  });

  describe("negative tests - forbidden field types", () => {
    it("converts all-forbidden config to all 'error' severities", () => {
      const uiConfig = createForbiddenConfig();
      const result = toConstraintConfig(uiConfig);

      expect(result.fieldTypes?.text).toBe("error");
      expect(result.fieldTypes?.number).toBe("error");
      expect(result.fieldTypes?.boolean).toBe("error");
      expect(result.fieldTypes?.staticEnum).toBe("error");
      expect(result.fieldTypes?.dynamicEnum).toBe("error");
      expect(result.fieldTypes?.dynamicSchema).toBe("error");
      expect(result.fieldTypes?.array).toBe("error");
      expect(result.fieldTypes?.object).toBe("error");
    });

    it("converts forbidden layout config to 'error' severities", () => {
      const uiConfig = createForbiddenConfig();
      const result = toConstraintConfig(uiConfig);

      expect(result.layout?.group).toBe("error");
      expect(result.layout?.conditionals).toBe("error");
    });

    it("converts single forbidden field type correctly", () => {
      const uiConfig = createAllowedConfig({ fieldTypes: { dynamicEnum: false } });
      const result = toConstraintConfig(uiConfig);

      // dynamicEnum should be error
      expect(result.fieldTypes?.dynamicEnum).toBe("error");
      // others should be off
      expect(result.fieldTypes?.text).toBe("off");
      expect(result.fieldTypes?.number).toBe("off");
    });
  });

  describe("edge cases", () => {
    it("handles maxNestingDepth of 0", () => {
      const uiConfig = createAllowedConfig({ layout: { maxNestingDepth: 0 } });
      const result = toConstraintConfig(uiConfig);

      expect(result.layout?.maxNestingDepth).toBe(0);
    });

    it("handles very large maxNestingDepth", () => {
      const uiConfig = createAllowedConfig({ layout: { maxNestingDepth: 100 } });
      const result = toConstraintConfig(uiConfig);

      expect(result.layout?.maxNestingDepth).toBe(100);
    });

    it("maps UI enum field to staticEnum constraint key", () => {
      // UI uses "enum" but constraints use "staticEnum"
      const uiConfig = createAllowedConfig({ fieldTypes: { enum: false } });
      const result = toConstraintConfig(uiConfig);

      expect(result.fieldTypes?.staticEnum).toBe("error");
    });

    it("maps UI when field to conditionals constraint key", () => {
      // UI uses "when" but constraints use "conditionals"
      const uiConfig = createAllowedConfig({ layout: { when: false } });
      const result = toConstraintConfig(uiConfig);

      expect(result.layout?.conditionals).toBe("error");
    });
  });

  describe("mixed configurations", () => {
    it("handles mixed allowed/forbidden field types", () => {
      const uiConfig = createAllowedConfig({
        fieldTypes: {
          text: true,
          number: false,
          dynamicEnum: false,
          dynamicSchema: false,
        },
      });
      const result = toConstraintConfig(uiConfig);

      expect(result.fieldTypes?.text).toBe("off");
      expect(result.fieldTypes?.number).toBe("error");
      expect(result.fieldTypes?.boolean).toBe("off");
      expect(result.fieldTypes?.dynamicEnum).toBe("error");
      expect(result.fieldTypes?.dynamicSchema).toBe("error");
    });

    it("handles layout restrictions independent of field types", () => {
      const uiConfig = createAllowedConfig({
        fieldTypes: { text: true, number: true },
        layout: { group: false, when: true },
      });
      const result = toConstraintConfig(uiConfig);

      expect(result.fieldTypes?.text).toBe("off");
      expect(result.fieldTypes?.number).toBe("off");
      expect(result.layout?.group).toBe("error");
      expect(result.layout?.conditionals).toBe("off");
    });
  });
});

describe("hasActiveConstraints", () => {
  describe("positive tests - detecting restrictions", () => {
    it("returns true when any field type is restricted", () => {
      const uiConfig = createAllowedConfig({ fieldTypes: { dynamicEnum: false } });
      expect(hasActiveConstraints(uiConfig)).toBe(true);
    });

    it("returns true when group is restricted", () => {
      const uiConfig = createAllowedConfig({ layout: { group: false } });
      expect(hasActiveConstraints(uiConfig)).toBe(true);
    });

    it("returns true when when is restricted", () => {
      const uiConfig = createAllowedConfig({ layout: { when: false } });
      expect(hasActiveConstraints(uiConfig)).toBe(true);
    });

    it("returns true when multiple restrictions are active", () => {
      const uiConfig = createAllowedConfig({
        fieldTypes: { text: false, number: false },
        layout: { group: false },
      });
      expect(hasActiveConstraints(uiConfig)).toBe(true);
    });
  });

  describe("negative tests - no restrictions", () => {
    it("returns false when all constraints are allowed", () => {
      const uiConfig = createAllowedConfig();
      expect(hasActiveConstraints(uiConfig)).toBe(false);
    });

    it("returns false even with custom maxNestingDepth", () => {
      // maxNestingDepth doesn't count as a "restriction" for this function
      const uiConfig = createAllowedConfig({ layout: { maxNestingDepth: 1 } });
      expect(hasActiveConstraints(uiConfig)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns true when all field types forbidden but layout allowed", () => {
      const uiConfig: ConstraintsConfig = {
        fieldTypes: {
          text: false,
          number: false,
          boolean: false,
          enum: false,
          dynamicEnum: false,
          dynamicSchema: false,
          array: false,
          object: false,
        },
        layout: {
          group: true,
          when: true,
          maxNestingDepth: 5,
        },
      };
      expect(hasActiveConstraints(uiConfig)).toBe(true);
    });

    it("returns true when all layout forbidden but field types allowed", () => {
      const uiConfig = createAllowedConfig({
        layout: { group: false, when: false },
      });
      expect(hasActiveConstraints(uiConfig)).toBe(true);
    });

    it("returns true when only one field type is forbidden", () => {
      // Each field type should be detected individually
      const fieldTypes = ["text", "number", "boolean", "enum", "dynamicEnum", "dynamicSchema", "array", "object"] as const;

      for (const fieldType of fieldTypes) {
        const uiConfig = createAllowedConfig({
          fieldTypes: { [fieldType]: false },
        });
        expect(hasActiveConstraints(uiConfig)).toBe(true);
      }
    });
  });
});
