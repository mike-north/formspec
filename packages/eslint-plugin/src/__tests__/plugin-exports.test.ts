import { describe, expect, it } from "vitest";
import packageJson from "../../package.json" with { type: "json" };
import plugin, { configs, meta, rules } from "../index.js";

describe("@formspec/eslint-plugin exports", () => {
  it("exposes the expected default export shape", () => {
    expect(plugin.meta).toBe(meta);
    expect(plugin.rules).toBe(rules);
    expect(plugin.configs).toBe(configs);
  });

  it("exposes rule maps and flat configs used by consumers and doc generation", () => {
    expect(meta).toMatchObject({
      name: "@formspec/eslint-plugin",
      version: packageJson.version,
    });

    expect(Object.keys(rules)).toEqual(
      expect.arrayContaining([
        "tag-recognition/no-unknown-tags",
        "constraint-validation/no-description-conflict",
        "constraints-allowed-field-types",
      ])
    );

    expect(configs.recommended).toBeInstanceOf(Array);
    expect(configs.strict).toBeInstanceOf(Array);
    expect(configs.recommended[0]?.plugins?.["@formspec"]).toMatchObject({
      meta,
      rules,
    });
    expect(configs.strict[0]?.plugins?.["@formspec"]).toMatchObject({
      meta,
      rules,
    });
  });
});
