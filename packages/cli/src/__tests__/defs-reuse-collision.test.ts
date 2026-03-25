/**
 * Tests for Bug 3: $defs reuse by name without schema comparison.
 *
 * When convertObjectType encounters a type name already in the defsRegistry
 * via `has()`, it currently returns a $ref without verifying the schema matches.
 * If two different interfaces happen to have the same name (from different
 * scopes), the second one silently gets the wrong $ref.
 *
 * The fix: replace the `has()` early return with a path that also uses
 * registerAndGetName so proper deduplication occurs.
 */

import { describe, it, expect } from "vitest";
import { DefsRegistry } from "../analyzer/type-converter.js";

// ============================================================================
// DefsRegistry unit-level: confirm registerAndGetName handles same-name
// different-schema correctly (already tested in defs-registry-dedup.test.ts;
// here we specifically test the scenario relevant to Bug 3)
// ============================================================================

describe("DefsRegistry — has() vs registerAndGetName() for name collisions", () => {
  it("registerAndGetName returns a deduplicated name for different schemas with the same name", () => {
    const registry = new DefsRegistry();

    // First registration — some interface "Address" with street
    registry.registerAndGetName("Address", {
      type: "object",
      properties: { street: { type: "string" } },
    });

    // Second registration — different "Address" with city (from a different scope)
    const name2 = registry.registerAndGetName("Address", {
      type: "object",
      properties: { city: { type: "string" } },
    });

    // Must NOT silently reuse "Address"; must deduplicate
    expect(name2).toBe("Address_2");
  });

  it("has() + naive $ref construction misses the dedup — demonstrates the bug scenario", () => {
    // This test documents the scenario that triggered Bug 3.
    // If code does: if (registry.has(name)) return $ref(name) — it bypasses dedup.
    const registry = new DefsRegistry();

    registry.registerAndGetName("Widget", {
      type: "object",
      properties: { foo: { type: "string" } },
    });

    // has() returns true — a naive `has()` check would just return $ref: #/$defs/Widget
    expect(registry.has("Widget")).toBe(true);

    // But the second schema is different!
    const correctName = registry.registerAndGetName("Widget", {
      type: "object",
      properties: { bar: { type: "number" } },
    });

    // The correct behaviour is to deduplicate
    expect(correctName).toBe("Widget_2");

    // Both schemas must be stored under their respective keys
    expect(registry.get("Widget")?.properties?.["foo"]).toBeDefined();
    expect(registry.get("Widget_2")?.properties?.["bar"]).toBeDefined();
  });

  it("has() correctly signals idempotent re-registration does NOT require dedup", () => {
    const registry = new DefsRegistry();

    const schema = {
      type: "object" as const,
      properties: { x: { type: "string" as const } },
    };

    registry.registerAndGetName("Point", schema);

    // Same schema again — has() is true AND registerAndGetName returns original name
    expect(registry.has("Point")).toBe(true);
    const sameName = registry.registerAndGetName("Point", schema);
    expect(sameName).toBe("Point"); // idempotent
    expect(registry.size).toBe(1); // no duplicate created
    expect(registry.warnings).toHaveLength(0); // no warning for identical schema
  });
});

// ============================================================================
// Integration: two different TypeScript interfaces with the same name appearing
// in the same program (via module augmentation / declaration merging is not
// possible, but we can test via a class with two fields of different named types
// that happen to share the same name — only possible across files; instead we
// test the registry behavior directly and the $ref path via unit test above).
// ============================================================================

describe("DefsRegistry — $ref correctness for same-name collisions", () => {
  it("the $ref returned for the second registration points to the deduplicated key", () => {
    const registry = new DefsRegistry();

    const name1 = registry.registerAndGetName("Shape", {
      type: "object",
      properties: { sides: { type: "number" } },
    });

    const name2 = registry.registerAndGetName("Shape", {
      type: "object",
      properties: { radius: { type: "number" } },
    });

    // The $ref for each should point to the correct key
    expect(`#/$defs/${name1}`).toBe("#/$defs/Shape");
    expect(`#/$defs/${name2}`).toBe("#/$defs/Shape_2");

    // Verify the schemas are under the correct keys
    expect(registry.get("Shape")?.properties?.["sides"]).toBeDefined();
    expect(registry.get("Shape_2")?.properties?.["radius"]).toBeDefined();
  });

  it("a third distinct schema with the same name gets _3", () => {
    const registry = new DefsRegistry();

    registry.registerAndGetName("Thing", { type: "object", properties: { a: { type: "string" } } });
    registry.registerAndGetName("Thing", { type: "object", properties: { b: { type: "string" } } });
    const name3 = registry.registerAndGetName("Thing", { type: "object", properties: { c: { type: "string" } } });

    expect(name3).toBe("Thing_3");
    expect(registry.get("Thing_3")?.properties?.["c"]).toBeDefined();
  });
});
