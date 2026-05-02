import { describe, expect, it } from "vitest";
import * as config from "@formspec/config";
import packageJson from "../package.json" with { type: "json" };

describe("@formspec/config public barrel", () => {
  it("publishes only the package root entry point", () => {
    // Issue #430 is an internal split only; loading/application subpaths must
    // not become public package exports.
    expect(Object.keys(packageJson.exports).sort()).toEqual(["."]);
  });

  it("keeps the runtime export surface stable across internal file moves", () => {
    // This guards the package root against accidentally publishing internals
    // while the implementation files move between bounded-context folders.
    expect(Object.keys(config).sort()).toEqual([
      "DEFAULT_CONFIG",
      "DEFAULT_CONSTRAINTS",
      "DEFAULT_DSL_POLICY",
      "defineConstraints",
      "defineDSLPolicy",
      "defineFormSpecConfig",
      "extractFieldOptions",
      "getFieldOptionSeverity",
      "getFieldTypeSeverity",
      "isFieldOptionAllowed",
      "isFieldTypeAllowed",
      "isLayoutTypeAllowed",
      "isNestingDepthAllowed",
      "loadConfig",
      "loadFormSpecConfig",
      "mergeWithDefaults",
      "resolveConfigForFile",
      "validateFieldOptions",
      "validateFieldTypes",
      "validateFormSpec",
      "validateFormSpecElements",
      "validateLayout",
    ]);
  });

  it("does not expose loading implementation helpers from the package root", () => {
    expect("nodeFileSystem" in config).toBe(false);
  });
});
