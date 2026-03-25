/**
 * Tests for Bug 2: combineRules with nested object scopes.
 *
 * When a when() is inside a field.object(), the rule's scope looks like
 * "#/properties/payment/properties/method". If this rule is then combined
 * with a parent rule via combineRules, the current implementation does
 * scope.replace("#/properties/", "") which only strips the FIRST prefix,
 * leaving a broken property key like "payment/properties/method".
 *
 * The fix: parse the full scope path into a nested properties structure.
 */

import { describe, it, expect } from "vitest";
import { buildFormSchemas, generateUiSchema } from "../index.js";
import { formspec, field, when, is } from "@formspec/dsl";
import type { Rule } from "../ui-schema/types.js";

// ---------------------------------------------------------------------------
// Helper: find a control by its trailing scope segment
// ---------------------------------------------------------------------------
function findControlByScope(
  elements: readonly { type: string; scope?: string; elements?: unknown[] }[],
  scopeSuffix: string
): { type: string; scope: string; rule?: Rule } | undefined {
  for (const el of elements) {
    if (el.type === "Control" && typeof el.scope === "string" && el.scope.endsWith(scopeSuffix)) {
      return el as { type: string; scope: string; rule?: Rule };
    }
    if (Array.isArray(el.elements)) {
      const found = findControlByScope(
        el.elements as { type: string; scope?: string; elements?: unknown[] }[],
        scopeSuffix
      );
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Bug 2a: when() directly inside field.object() — rule scope must be nested
// ---------------------------------------------------------------------------

describe("combineRules — conditional inside object field (no parent conditional)", () => {
  it("produces a rule with a properly nested scope for a when() inside field.object()", () => {
    const form = formspec(
      field.objectWithConfig(
        "payment",
        { label: "Payment" },
        field.enum("method", ["card", "bank"] as const, { label: "Method" }),
        when(
          is("method", "card"),
          field.text("cardNumber", { label: "Card Number" })
        )
      )
    );

    const { uiSchema } = buildFormSchemas(form);
    const elements = uiSchema.elements as { type: string; scope?: string; elements?: unknown[] }[];

    const cardControl = findControlByScope(elements, "/cardNumber");
    expect(cardControl).toBeDefined();
    if (!cardControl?.rule) throw new Error("cardNumber has no rule");

    const rule = cardControl.rule;
    expect(rule.effect).toBe("SHOW");

    // The condition must reference payment.method (nested scope), not a flat "method"
    // Correct: scope like "#/properties/payment/properties/method"
    // OR the combined form with scope="#" and nested properties structure
    const condition = rule.condition;
    if (condition.scope === "#") {
      // allOf form — must have nested properties: { payment: { properties: { method: ... } } }
      // OR the flat form: { method: { const: "card" } } — the latter is the BUG
      const schema = condition.schema;
      expect(schema.allOf ?? schema.properties).toBeDefined();
      if (schema.properties) {
        // Must NOT have "method" as a top-level key (that would be wrong)
        expect(schema.properties["method"]).toBeUndefined();
        // Must have nested path going through payment
        expect(schema.properties["payment"]).toBeDefined();
      }
    } else {
      // Direct scope form — must reference the nested path
      expect(condition.scope).toContain("/payment/");
      expect(condition.scope).toContain("/method");
    }
  });
});

// ---------------------------------------------------------------------------
// Bug 2b: when() inside field.object() that is inside another when()
// — combining a nested-scope rule with a flat-scope rule must produce
//   a correct allOf with properly nested properties, not broken keys
// ---------------------------------------------------------------------------

describe("combineRules — when() inside field.object() inside another when()", () => {
  it("combines parent flat rule and nested object rule without broken keys", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      when(
        is("type", "a"),
        field.objectWithConfig(
          "details",
          { label: "Details" },
          field.enum("subtype", ["x", "y"] as const),
          when(
            is("subtype", "x"),
            field.text("xField", { label: "X Field" })
          )
        )
      )
    );

    const uiSchema = generateUiSchema(form);
    const elements = uiSchema.elements as { type: string; scope?: string; elements?: unknown[] }[];

    const xControl = findControlByScope(elements, "/xField");
    expect(xControl).toBeDefined();
    if (!xControl?.rule) throw new Error("xField has no rule");

    const rule = xControl.rule;
    expect(rule.effect).toBe("SHOW");

    // The combined condition must be an allOf with scope "#"
    expect(rule.condition.scope).toBe("#");
    const allOf = rule.condition.schema.allOf;
    expect(allOf).toBeDefined();
    if (!allOf) throw new Error("allOf not found");
    expect(allOf).toHaveLength(2);

    // allOf[0]: parent condition — type = "a" — flat properties.type
    const parentCond = allOf[0];
    expect(parentCond).toBeDefined();
    if (!parentCond) throw new Error("allOf[0] not found");

    // The parent condition should reference "type" at the top level
    expect(parentCond.properties).toBeDefined();
    expect(parentCond.properties?.["type"]).toBeDefined();
    expect(parentCond.properties?.["type"]?.const).toBe("a");
    // MUST NOT have a broken key like "type" (already correct for flat)
    expect(Object.keys(parentCond.properties ?? {})).not.toContain("details/properties/subtype");

    // allOf[1]: child condition — details.subtype = "x"
    // The scope of the child condition was "#/properties/details/properties/subtype"
    // so after parsing it should produce { properties: { details: { properties: { subtype: ... } } } }
    const childCond = allOf[1];
    expect(childCond).toBeDefined();
    if (!childCond) throw new Error("allOf[1] not found");

    // MUST NOT have a broken flat key like "details/properties/subtype"
    if (childCond.properties) {
      const keys = Object.keys(childCond.properties);
      for (const key of keys) {
        expect(key).not.toContain("/"); // No slash-containing keys allowed
      }
      // Must have "details" as a nested structure
      expect(keys).toContain("details");
      const detailsProp = childCond.properties["details"];
      expect(detailsProp?.properties?.["subtype"]).toBeDefined();
      expect(detailsProp?.properties?.["subtype"]?.const).toBe("x");
    } else {
      // Unexpected form — fail with a descriptive message
      throw new Error(
        `Expected childCond to have properties, got: ${JSON.stringify(childCond)}`
      );
    }
  });

  it("does not produce any property key containing a slash", () => {
    const form = formspec(
      field.enum("kind", ["fast", "slow"] as const),
      when(
        is("kind", "fast"),
        field.objectWithConfig(
          "config",
          { label: "Config" },
          field.enum("mode", ["turbo", "normal"] as const),
          when(
            is("mode", "turbo"),
            field.text("boost", { label: "Boost Setting" })
          )
        )
      )
    );

    const uiSchema = generateUiSchema(form);
    const elements = uiSchema.elements as { type: string; scope?: string; elements?: unknown[] }[];

    const boostControl = findControlByScope(elements, "/boost");
    expect(boostControl).toBeDefined();
    if (!boostControl?.rule) throw new Error("boost has no rule");

    const allOf = boostControl.rule.condition.schema.allOf ?? [];
    for (const cond of allOf) {
      if (cond.properties) {
        for (const key of Object.keys(cond.properties)) {
          expect(key, `Property key "${key}" contains a slash — broken combineRules`).not.toContain("/");
        }
      }
    }
  });
});
