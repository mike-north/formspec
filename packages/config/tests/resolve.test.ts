/**
 * Tests for per-file config resolution and package override merging.
 *
 * @see ../resolve.ts
 */
import { describe, it, expect } from "vitest";
import { resolveConfigForFile } from "../src/index.js";
import type { FormSpecConfig } from "../src/index.js";

const CONFIG_DIR = "/fake/project";

describe("resolveConfigForFile", () => {
  it("returns root enumSerialization when no packages overrides exist", () => {
    const config: FormSpecConfig = { enumSerialization: "oneOf" };

    const resolved = resolveConfigForFile(config, `${CONFIG_DIR}/src/forms.ts`, CONFIG_DIR);

    expect(resolved.enumSerialization).toBe("oneOf");
  });

  it("fills in `extensions` with an empty array when the user did not configure any", () => {
    // The build side treats `extensions: []` the same as `extensions: undefined`
    // (no registry constructed), so filling this in is safe.
    const config: FormSpecConfig = {
      enumSerialization: "enum",
      packages: {
        "packages/api/**": { enumSerialization: "oneOf" },
      },
    };

    const resolved = resolveConfigForFile(
      config,
      `${CONFIG_DIR}/packages/api/src/forms.ts`,
      CONFIG_DIR
    );

    expect(resolved.extensions).toEqual([]);
    expect(resolved.enumSerialization).toBe("oneOf");
  });

  it("fills in the default vendorPrefix when not configured", () => {
    const config: FormSpecConfig = { enumSerialization: "oneOf" };

    const resolved = resolveConfigForFile(config, `${CONFIG_DIR}/src/forms.ts`, CONFIG_DIR);

    expect(resolved.vendorPrefix).toBe("x-formspec");
  });

  it("applies the first matching package override's enumSerialization", () => {
    const config: FormSpecConfig = {
      enumSerialization: "enum",
      packages: {
        "packages/api/**": { enumSerialization: "oneOf" },
        "packages/web/**": { enumSerialization: "smart-size" },
      },
    };

    const resolved = resolveConfigForFile(
      config,
      `${CONFIG_DIR}/packages/web/src/forms.ts`,
      CONFIG_DIR
    );

    expect(resolved.enumSerialization).toBe("smart-size");
  });

  it("falls back to the root value when no override pattern matches", () => {
    const config: FormSpecConfig = {
      enumSerialization: "oneOf",
      packages: {
        "packages/api/**": { enumSerialization: "enum" },
      },
    };

    const resolved = resolveConfigForFile(
      config,
      `${CONFIG_DIR}/packages/web/src/forms.ts`,
      CONFIG_DIR
    );

    expect(resolved.enumSerialization).toBe("oneOf");
  });

  it("returns the first matching override when two patterns both match (declaration order wins)", () => {
    // Documents the first-match-wins contract on `resolveConfigForFile`.
    const config: FormSpecConfig = {
      enumSerialization: "enum",
      packages: {
        "packages/**": { enumSerialization: "oneOf" },
        "packages/api/**": { enumSerialization: "smart-size" },
      },
    };

    const resolved = resolveConfigForFile(
      config,
      `${CONFIG_DIR}/packages/api/src/forms.ts`,
      CONFIG_DIR
    );

    expect(resolved.enumSerialization).toBe("oneOf");
  });
});
