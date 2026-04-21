/**
 * Tests for per-file config resolution and package override merging.
 *
 * @see ../resolve.ts
 */
import { describe, it, expect } from "vitest";
import { mergePackageOverridesForFile, resolveConfigForFile } from "../index.js";
import type { FormSpecConfig } from "../index.js";

const CONFIG_DIR = "/fake/project";

describe("mergePackageOverridesForFile", () => {
  it("returns root config untouched when no packages overrides exist", () => {
    const config: FormSpecConfig = { enumSerialization: "oneOf" };

    const merged = mergePackageOverridesForFile(config, `${CONFIG_DIR}/src/forms.ts`, CONFIG_DIR);

    expect(merged).toEqual(config);
  });

  it("preserves undefined `extensions` when the user did not configure any", () => {
    // Regression: callers that hand the merged config to schema-generation APIs
    // rely on `extensions` remaining `undefined` so the build side does not
    // construct an empty extension registry on every invocation.
    const config: FormSpecConfig = {
      enumSerialization: "enum",
      packages: {
        "packages/api/**": { enumSerialization: "oneOf" },
      },
    };

    const merged = mergePackageOverridesForFile(
      config,
      `${CONFIG_DIR}/packages/api/src/forms.ts`,
      CONFIG_DIR
    );

    expect(merged.extensions).toBeUndefined();
    expect(merged.enumSerialization).toBe("oneOf");
  });

  it("applies the first matching package override's enumSerialization", () => {
    const config: FormSpecConfig = {
      enumSerialization: "enum",
      packages: {
        "packages/api/**": { enumSerialization: "oneOf" },
        "packages/web/**": { enumSerialization: "smart-size" },
      },
    };

    const merged = mergePackageOverridesForFile(
      config,
      `${CONFIG_DIR}/packages/web/src/forms.ts`,
      CONFIG_DIR
    );

    expect(merged.enumSerialization).toBe("smart-size");
  });

  it("falls back to the root value when no override pattern matches", () => {
    const config: FormSpecConfig = {
      enumSerialization: "oneOf",
      packages: {
        "packages/api/**": { enumSerialization: "enum" },
      },
    };

    const merged = mergePackageOverridesForFile(
      config,
      `${CONFIG_DIR}/packages/web/src/forms.ts`,
      CONFIG_DIR
    );

    expect(merged.enumSerialization).toBe("oneOf");
  });
});

describe("resolveConfigForFile", () => {
  it("fills in `extensions` with an empty array when not configured", () => {
    // `resolveConfigForFile` is the defaults-filled variant; it intentionally
    // produces an always-defined `extensions` array. Consumers that need the
    // pre-defaults shape should use `mergePackageOverridesForFile` instead.
    const config: FormSpecConfig = { enumSerialization: "oneOf" };

    const resolved = resolveConfigForFile(config, `${CONFIG_DIR}/src/forms.ts`, CONFIG_DIR);

    expect(resolved.extensions).toEqual([]);
    expect(resolved.enumSerialization).toBe("oneOf");
    expect(resolved.vendorPrefix).toBe("x-formspec");
  });

  it("applies package overrides before filling defaults", () => {
    const config: FormSpecConfig = {
      enumSerialization: "enum",
      packages: {
        "packages/api/**": { enumSerialization: "smart-size" },
      },
    };

    const resolved = resolveConfigForFile(
      config,
      `${CONFIG_DIR}/packages/api/src/forms.ts`,
      CONFIG_DIR
    );

    expect(resolved.enumSerialization).toBe("smart-size");
  });
});
