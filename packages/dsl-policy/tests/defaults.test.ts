import { describe, expect, it } from "vitest";
import { DEFAULT_DSL_POLICY, mergeWithDefaults } from "../src/index.js";

describe("mergeWithDefaults", () => {
  // Regression tests for #530: `mergeWithDefaults(undefined)` returned the module-level
  // `DEFAULT_DSL_POLICY` object by reference. `ResolvedDSLPolicy` is not deeply readonly, so
  // any caller that mutated its "resolved" policy corrupted the shared default for every
  // subsequent caller.
  it("does not return the shared DEFAULT_DSL_POLICY object by reference (#530)", () => {
    const resolved = mergeWithDefaults(undefined);

    expect(resolved).not.toBe(DEFAULT_DSL_POLICY);
    expect(resolved).toEqual(DEFAULT_DSL_POLICY);
  });

  it("mutating one call's result does not affect a second call's result (#530)", () => {
    const first = mergeWithDefaults(undefined);
    first.fieldTypes.text = "error";
    first.layout.maxNestingDepth = 0;
    first.uiSchema.rules.effects.SHOW = "error";
    first.controlOptions.custom["mutated"] = "error";

    const second = mergeWithDefaults(undefined);

    expect(second.fieldTypes.text).toBe("off");
    expect(second.layout.maxNestingDepth).toBe(Infinity);
    expect(second.uiSchema.rules.effects.SHOW).toBe("off");
    expect(second.controlOptions.custom["mutated"]).toBeUndefined();
  });

  it("mutating a resolved policy does not corrupt the shared DEFAULT_DSL_POLICY default (#530)", () => {
    const resolved = mergeWithDefaults(undefined);
    resolved.fieldTypes.text = "error";
    resolved.controlOptions.custom["mutated"] = "error";

    expect(DEFAULT_DSL_POLICY.fieldTypes.text).toBe("off");
    expect(DEFAULT_DSL_POLICY.controlOptions.custom["mutated"]).toBeUndefined();
  });

  it("merges a partial config on top of independent default copies without sharing state (#530)", () => {
    const withOverride = mergeWithDefaults({ fieldTypes: { text: "error" } });
    const withoutOverride = mergeWithDefaults(undefined);

    expect(withOverride.fieldTypes.text).toBe("error");
    expect(withoutOverride.fieldTypes.text).toBe("off");
  });
});
