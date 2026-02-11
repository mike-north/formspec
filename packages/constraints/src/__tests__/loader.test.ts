import { describe, it, expect } from "vitest";
import { loadConfigFromString, defineConstraints } from "../index.js";

describe("loadConfigFromString", () => {
  it("parses YAML with constraints section", () => {
    const yaml = `
constraints:
  fieldTypes:
    dynamicEnum: error
    dynamicSchema: error
  layout:
    group: error
    conditionals: warn
`;
    const config = loadConfigFromString(yaml);

    expect(config.fieldTypes.dynamicEnum).toBe("error");
    expect(config.fieldTypes.dynamicSchema).toBe("error");
    expect(config.layout.group).toBe("error");
    expect(config.layout.conditionals).toBe("warn");
  });

  it("applies defaults for missing values", () => {
    const yaml = `
constraints:
  fieldTypes:
    dynamicEnum: error
`;
    const config = loadConfigFromString(yaml);

    expect(config.fieldTypes.dynamicEnum).toBe("error");
    expect(config.fieldTypes.text).toBe("off");
    expect(config.fieldTypes.number).toBe("off");
    expect(config.layout.group).toBe("off");
  });

  it("handles empty YAML", () => {
    const config = loadConfigFromString("");

    // Should return all defaults
    expect(config.fieldTypes.text).toBe("off");
    expect(config.layout.group).toBe("off");
  });

  it("handles YAML with only comments", () => {
    const yaml = `
# This is a comment
# Another comment
`;
    const config = loadConfigFromString(yaml);
    expect(config.fieldTypes.text).toBe("off");
  });

  it("parses nested uiSchema constraints", () => {
    const yaml = `
constraints:
  uiSchema:
    layouts:
      VerticalLayout: off
      HorizontalLayout: error
      Group: error
    rules:
      enabled: error
`;
    const config = loadConfigFromString(yaml);

    expect(config.uiSchema.layouts.VerticalLayout).toBe("off");
    expect(config.uiSchema.layouts.HorizontalLayout).toBe("error");
    expect(config.uiSchema.layouts.Group).toBe("error");
    expect(config.uiSchema.rules.enabled).toBe("error");
  });

  it("parses fieldOptions constraints", () => {
    const yaml = `
constraints:
  fieldOptions:
    minItems: error
    maxItems: error
    placeholder: warn
`;
    const config = loadConfigFromString(yaml);

    expect(config.fieldOptions.minItems).toBe("error");
    expect(config.fieldOptions.maxItems).toBe("error");
    expect(config.fieldOptions.placeholder).toBe("warn");
    expect(config.fieldOptions.label).toBe("off");
  });

  it("parses maxNestingDepth as number", () => {
    const yaml = `
constraints:
  layout:
    maxNestingDepth: 2
`;
    const config = loadConfigFromString(yaml);
    expect(config.layout.maxNestingDepth).toBe(2);
  });

  it("throws on invalid YAML structure", () => {
    const yaml = `
- this
- is
- an array
`;
    expect(() => loadConfigFromString(yaml)).toThrow();
  });
});

describe("defineConstraints", () => {
  it("creates config from object literal", () => {
    const config = defineConstraints({
      fieldTypes: {
        dynamicEnum: "error",
        array: "warn",
      },
      layout: {
        group: "error",
        maxNestingDepth: 1,
      },
    });

    expect(config.fieldTypes.dynamicEnum).toBe("error");
    expect(config.fieldTypes.array).toBe("warn");
    expect(config.fieldTypes.text).toBe("off"); // default
    expect(config.layout.group).toBe("error");
    expect(config.layout.maxNestingDepth).toBe(1);
  });

  it("handles empty config", () => {
    const config = defineConstraints({});

    // All defaults
    expect(config.fieldTypes.text).toBe("off");
    expect(config.layout.group).toBe("off");
    expect(config.uiSchema.layouts.VerticalLayout).toBe("off");
  });

  it("handles partial nested config", () => {
    const config = defineConstraints({
      uiSchema: {
        rules: {
          enabled: "error",
        },
      },
    });

    expect(config.uiSchema.rules.enabled).toBe("error");
    expect(config.uiSchema.rules.effects.SHOW).toBe("off"); // default
    expect(config.uiSchema.layouts.VerticalLayout).toBe("off"); // default
  });
});
