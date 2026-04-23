import { describe, it, expect } from "vitest";
import { getDefinition } from "../src/providers/definition.js";

describe("getDefinition", () => {
  it("returns null (stub implementation)", () => {
    expect(getDefinition()).toBeNull();
  });
});
