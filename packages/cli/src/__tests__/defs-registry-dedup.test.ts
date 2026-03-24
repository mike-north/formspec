/**
 * Tests for DefsRegistry deduplication of name-colliding schemas.
 *
 * When the same type name is registered with two different schemas (which can
 * occur when two specializations of a generic type both resolve to the same
 * symbol name), the registry must deduplicate by appending `_2`, `_3`, etc.
 * and must record a warning diagnostic for each collision.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DefsRegistry } from "../analyzer/type-converter.js";

describe("DefsRegistry deduplication", () => {
  let registry: DefsRegistry;

  beforeEach(() => {
    registry = new DefsRegistry();
  });

  // ─── First registration ────────────────────────────────────────────────────

  it("returns the original name for the first registration", () => {
    const name = registry.registerAndGetName("Address", {
      type: "object",
      properties: { street: { type: "string" } },
    });
    expect(name).toBe("Address");
  });

  it("stores the schema under the original name", () => {
    registry.registerAndGetName("Address", {
      type: "object",
      properties: { street: { type: "string" } },
    });
    expect(registry.get("Address")).toBeDefined();
    expect(registry.get("Address")?.type).toBe("object");
  });

  it("emits no warnings for a fresh registration", () => {
    registry.registerAndGetName("Address", { type: "object" });
    expect(registry.warnings).toHaveLength(0);
  });

  // ─── Same schema re-registered ────────────────────────────────────────────

  it("returns the existing name when the exact same schema is registered again", () => {
    const schema = {
      type: "object" as const,
      properties: { x: { type: "string" as const } },
    };
    registry.registerAndGetName("Foo", schema);
    const name2 = registry.registerAndGetName("Foo", schema);
    expect(name2).toBe("Foo");
  });

  it("does not create a second entry when the same schema is re-registered", () => {
    const schema = { type: "object" as const };
    registry.registerAndGetName("Foo", schema);
    registry.registerAndGetName("Foo", schema);
    // Only one entry — Foo_2 should not exist
    expect(registry.get("Foo_2")).toBeUndefined();
    expect(registry.size).toBe(1);
  });

  it("emits no warnings for a same-schema re-registration", () => {
    const schema = { type: "object" as const };
    registry.registerAndGetName("Foo", schema);
    registry.registerAndGetName("Foo", schema);
    expect(registry.warnings).toHaveLength(0);
  });

  // ─── Different schema → deduplication ─────────────────────────────────────

  it("deduplicates with _2 suffix when same name is registered with a different schema", () => {
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "string" } },
    });
    const name2 = registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "number" } },
    });
    expect(name2).toBe("Box_2");
  });

  it("stores the deduplicated schema under the _2 key", () => {
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "string" } },
    });
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "number" } },
    });
    expect(registry.get("Box_2")).toBeDefined();
  });

  it("preserves the original name as a title annotation on the deduplicated entry", () => {
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "string" } },
    });
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "number" } },
    });
    expect(registry.get("Box_2")?.title).toBe("Box");
  });

  it("does not modify the original entry's schema", () => {
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "string" } },
    });
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { value: { type: "number" } },
    });
    // Original schema should not have a title annotation added
    expect(registry.get("Box")?.title).toBeUndefined();
  });

  it("emits a warning containing the colliding name for a collision", () => {
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { v: { type: "string" } },
    });
    registry.registerAndGetName("Box", {
      type: "object",
      properties: { v: { type: "number" } },
    });
    expect(registry.warnings).toHaveLength(1);
    expect(registry.warnings[0]).toContain("Box");
  });

  // ─── Multiple collisions → _2, _3 ─────────────────────────────────────────

  it("increments to _3 for a third distinct schema under the same name", () => {
    registry.registerAndGetName("T", {
      type: "object",
      properties: { a: { type: "string" } },
    });
    const n2 = registry.registerAndGetName("T", {
      type: "object",
      properties: { b: { type: "number" } },
    });
    const n3 = registry.registerAndGetName("T", {
      type: "object",
      properties: { c: { type: "boolean" } },
    });
    expect(n2).toBe("T_2");
    expect(n3).toBe("T_3");
  });

  it("stores all three variants under their respective keys", () => {
    registry.registerAndGetName("T", { type: "object", properties: { a: { type: "string" } } });
    registry.registerAndGetName("T", { type: "object", properties: { b: { type: "number" } } });
    registry.registerAndGetName("T", { type: "object", properties: { c: { type: "boolean" } } });

    expect(registry.get("T")).toBeDefined();
    expect(registry.get("T_2")).toBeDefined();
    expect(registry.get("T_3")).toBeDefined();
    expect(registry.size).toBe(3);
  });

  it("emits one warning per collision (two warnings for three distinct schemas)", () => {
    registry.registerAndGetName("T", { type: "object", properties: { a: { type: "string" } } });
    registry.registerAndGetName("T", { type: "object", properties: { b: { type: "number" } } });
    registry.registerAndGetName("T", { type: "object", properties: { c: { type: "boolean" } } });
    expect(registry.warnings).toHaveLength(2);
  });

  it("all collision warnings contain the colliding name", () => {
    registry.registerAndGetName("T", { type: "object", properties: { a: { type: "string" } } });
    registry.registerAndGetName("T", { type: "object", properties: { b: { type: "number" } } });
    registry.registerAndGetName("T", { type: "object", properties: { c: { type: "boolean" } } });
    for (const w of registry.warnings) {
      expect(w).toContain("T");
    }
  });

  // ─── Collisions across independent names don't interfere ──────────────────

  it("collision counters are independent per name", () => {
    // "A" collides once
    registry.registerAndGetName("A", { type: "object", properties: { x: { type: "string" } } });
    const a2 = registry.registerAndGetName("A", {
      type: "object",
      properties: { x: { type: "number" } },
    });

    // "B" collides once
    registry.registerAndGetName("B", { type: "object", properties: { y: { type: "string" } } });
    const b2 = registry.registerAndGetName("B", {
      type: "object",
      properties: { y: { type: "number" } },
    });

    expect(a2).toBe("A_2");
    expect(b2).toBe("B_2");
  });

  // ─── Interaction with legacy set() method ─────────────────────────────────

  it("registerAndGetName sees schemas registered via the legacy set() method", () => {
    // Pre-populate via set() as existing code does
    registry.set("Widget", { type: "object", properties: { id: { type: "string" } } });

    // Re-register with same schema — should return "Widget" (idempotent)
    const sameName = registry.registerAndGetName("Widget", {
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(sameName).toBe("Widget");

    // Re-register with different schema — should deduplicate
    const dedupName = registry.registerAndGetName("Widget", {
      type: "object",
      properties: { id: { type: "number" } },
    });
    expect(dedupName).toBe("Widget_2");
    expect(registry.warnings).toHaveLength(1);
  });
});
