/**
 * Tests for the withConfig() plugin factory.
 *
 * Verifies that:
 * - withConfig() returns the same plugin shape as the default export
 * - The returned configs inject settings.formspec.extensionRegistry
 * - The registry is constructed from the provided extensions array
 * - Both recommended and strict config arrays get the settings injected
 */

import { describe, expect, it } from "vitest";
import plugin, { withConfig, configs } from "../src/index.js";
import type { FormSpecConfig } from "@formspec/config";

const emptyConfig: FormSpecConfig = {};

const configWithExtension: FormSpecConfig = {
  extensions: [
    {
      extensionId: "x-test",
      types: [
        {
          typeName: "Decimal",
          tsTypeNames: ["Decimal"],
          jsonSchemaType: { type: "string", format: "decimal" },
          builtinConstraintBroadenings: [{ tagName: "minimum" }, { tagName: "maximum" }],
        },
      ],
    },
  ],
};

describe("withConfig()", () => {
  it("returns the standard plugin shape (meta, rules, configs)", () => {
    const configured = withConfig(emptyConfig);
    expect(configured).toHaveProperty("meta");
    expect(configured).toHaveProperty("rules");
    expect(configured).toHaveProperty("configs");
    expect(configured.configs).toHaveProperty("recommended");
    expect(configured.configs).toHaveProperty("strict");
  });

  it("injects extensionRegistry into every entry in configs.recommended", () => {
    const configured = withConfig(emptyConfig);
    for (const entry of configured.configs.recommended) {
      expect(entry.settings).toBeDefined();
      expect(entry.settings?.["formspec"]).toBeDefined();
      expect(
        (entry.settings?.["formspec"] as Record<string, unknown>)["extensionRegistry"]
      ).toBeDefined();
    }
  });

  it("injects extensionRegistry into every entry in configs.strict", () => {
    const configured = withConfig(emptyConfig);
    for (const entry of configured.configs.strict) {
      expect(entry.settings).toBeDefined();
      expect(
        (entry.settings?.["formspec"] as Record<string, unknown>)["extensionRegistry"]
      ).toBeDefined();
    }
  });

  it("registry from empty config has no types", () => {
    const configured = withConfig(emptyConfig);
    const entry = configured.configs.recommended[0];
    const registry = (entry?.settings?.["formspec"] as Record<string, unknown>)[
      "extensionRegistry"
    ] as { findTypeByName: (name: string) => unknown };
    expect(registry.findTypeByName("Decimal")).toBeUndefined();
  });

  it("registry from config with extensions resolves types and broadenings", () => {
    const configured = withConfig(configWithExtension);
    const entry = configured.configs.recommended[0];
    const registry = (entry?.settings?.["formspec"] as Record<string, unknown>)[
      "extensionRegistry"
    ] as {
      findTypeByName: (
        name: string
      ) => { extensionId: string; registration: { typeName: string } } | undefined;
      findBuiltinConstraintBroadening: (typeId: string, tagName: string) => object | undefined;
    };

    // Type resolves by TS name
    const typeResult = registry.findTypeByName("Decimal");
    expect(typeResult).toBeDefined();
    expect(typeResult?.extensionId).toBe("x-test");
    expect(typeResult?.registration.typeName).toBe("Decimal");

    // Broadening resolves for registered tags
    const typeId = `x-test/Decimal`;
    expect(registry.findBuiltinConstraintBroadening(typeId, "minimum")).toBeDefined();
    expect(registry.findBuiltinConstraintBroadening(typeId, "maximum")).toBeDefined();

    // Broadening absent for non-registered tags
    expect(registry.findBuiltinConstraintBroadening(typeId, "minLength")).toBeUndefined();
  });

  it("does not mutate the base plugin configs", () => {
    const baseRecommendedEntry = configs.recommended[0];
    const baseSettings = baseRecommendedEntry?.settings;

    withConfig(configWithExtension);

    // The original plugin's configs must be unchanged
    expect(configs.recommended[0]?.settings).toStrictEqual(baseSettings);
    expect(plugin.configs.recommended[0]?.settings).toStrictEqual(baseSettings);
  });
});
