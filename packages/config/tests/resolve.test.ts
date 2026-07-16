/**
 * Tests for per-file config resolution and package override merging.
 *
 * @see ../src/loading/resolve.ts
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

  it("carries the root serialization block through resolution", () => {
    const config: FormSpecConfig = {
      serialization: {
        vocabularyBaseUrl: "https://example.com/schema/v1",
        dialectUrl: "https://example.com/schema/v1/dialect.json",
      },
    };

    const resolved = resolveConfigForFile(config, `${CONFIG_DIR}/src/forms.ts`, CONFIG_DIR);

    expect(resolved.serialization).toEqual(config.serialization);
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

/**
 * Table-driven coverage of the internal `matchGlob` pattern-matching
 * semantics, exercised indirectly through `resolveConfigForFile`'s
 * `packages` glob matching (see ../src/loading/resolve.ts).
 *
 * Regression coverage for #545: a pattern-leading `**\/` must match zero
 * directories (e.g. `**\/forms.ts` matches a top-level `forms.ts`), matching
 * standard glob semantics where `**\/` is optional. Trailing and interior
 * `**` behavior is pinned unchanged.
 */
describe("matchGlob semantics (via package override matching)", () => {
  const ROOT_VALUE = "enum";
  const OVERRIDE_VALUE = "oneOf";

  function matches(pattern: string, filePath: string): boolean {
    const config: FormSpecConfig = {
      enumSerialization: ROOT_VALUE,
      packages: { [pattern]: { enumSerialization: OVERRIDE_VALUE } },
    };

    const resolved = resolveConfigForFile(config, `${CONFIG_DIR}/${filePath}`, CONFIG_DIR);

    return resolved.enumSerialization === OVERRIDE_VALUE;
  }

  const cases: { name: string; pattern: string; filePath: string; expected: boolean }[] = [
    // Leading **/ — the zero-directory bug from #545.
    {
      name: "leading **/ matches a top-level file (zero directories)",
      pattern: "**/forms.ts",
      filePath: "forms.ts",
      expected: true,
    },
    {
      name: "leading **/ matches a file nested one directory deep",
      pattern: "**/forms.ts",
      filePath: "src/forms.ts",
      expected: true,
    },
    {
      name: "leading **/ matches a file nested several directories deep",
      pattern: "**/forms.ts",
      filePath: "src/nested/deep/forms.ts",
      expected: true,
    },
    {
      name: "leading **/ combined with * matches a top-level file (zero directories)",
      pattern: "**/*.ts",
      filePath: "a.ts",
      expected: true,
    },
    {
      name: "leading **/ combined with * matches a nested file",
      pattern: "**/*.ts",
      filePath: "src/a.ts",
      expected: true,
    },
    {
      name: "leading **/ does not match a different filename",
      pattern: "**/forms.ts",
      filePath: "other.ts",
      expected: false,
    },
    // Trailing ** — existing behavior, pinned unchanged.
    {
      name: "trailing ** matches files nested under the prefix",
      pattern: "packages/api/**",
      filePath: "packages/api/src/forms.ts",
      expected: true,
    },
    {
      name: "trailing ** matches the prefix directory itself with no further nesting",
      pattern: "packages/api/**",
      filePath: "packages/api/forms.ts",
      expected: true,
    },
    {
      name: "trailing ** does not match files outside the prefix",
      pattern: "packages/api/**",
      filePath: "packages/web/src/forms.ts",
      expected: false,
    },
    // Interior ** — existing behavior, pinned unchanged.
    {
      name: "interior ** matches across intermediate directories",
      pattern: "packages/**/forms.ts",
      filePath: "packages/api/src/forms.ts",
      expected: true,
    },
    {
      name: "interior ** does not match a different filename",
      pattern: "packages/**/forms.ts",
      filePath: "packages/api/src/other.ts",
      expected: false,
    },
    // Single-segment * — existing behavior, pinned unchanged.
    {
      name: "single * matches within one path segment",
      pattern: "packages/*/forms.ts",
      filePath: "packages/api/forms.ts",
      expected: true,
    },
    {
      name: "single * does not cross a directory boundary",
      pattern: "packages/*/forms.ts",
      filePath: "packages/api/src/forms.ts",
      expected: false,
    },
  ];

  it.each(cases)("$name", ({ pattern, filePath, expected }) => {
    expect(matches(pattern, filePath)).toBe(expected);
  });
});
