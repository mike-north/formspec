/**
 * JSON Forms UI Schema generator that operates on the canonical FormIR.
 *
 * This generator consumes the IR produced by the Canonicalize phase and
 * produces a JSON Forms UI Schema. All downstream UI Schema generation
 * should use this module for UI Schema generation.
 */

import type { FormIR, FormIRElement, FieldNode, GroupLayoutNode } from "@formspec/core";
import type { UISchema, UISchemaElement, ControlElement, GroupLayout, Rule } from "./types.js";
import { uiSchema as uiSchemaValidator } from "./schema.js";
import { z } from "zod";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Parses a value through a Zod schema, converting validation errors to a
 * descriptive Error.
 */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Generated ${label} failed validation:\n${error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`
      );
    }
    throw error;
  }
}

/**
 * Converts a field name to a JSON Pointer scope string.
 */
function fieldToScope(fieldName: string): string {
  return `#/properties/${fieldName}`;
}

/**
 * Converts a property name into a human-friendly UI label.
 *
 * Examples:
 * - `fullName` -> `Full Name`
 * - `billing_address` -> `Billing Address`
 * - `account-id` -> `Account Id`
 */
function inferLabelFromFieldName(fieldName: string): string {
  const withSpaces = fieldName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (withSpaces === "") {
    return fieldName;
  }

  return withSpaces
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Creates a SHOW rule for a single conditional field/value pair.
 */
function createShowRule(fieldName: string, value: unknown): Rule {
  return {
    effect: "SHOW",
    condition: {
      scope: fieldToScope(fieldName),
      schema: { const: value },
    },
  };
}

/**
 * Combines two SHOW rules into a single rule using an allOf condition.
 *
 * When elements are nested inside multiple conditionals, all parent conditions
 * must be met for the element to be visible. This function merges the two
 * conditions into a single rule using allOf so that JSON Forms evaluates
 * both predicates simultaneously.
 */
function combineRules(parentRule: Rule, childRule: Rule): Rule {
  const parentCondition = parentRule.condition;
  const childCondition = childRule.condition;

  return {
    effect: "SHOW",
    condition: {
      scope: "#",
      schema: {
        allOf: [
          {
            properties: {
              [parentCondition.scope.replace("#/properties/", "")]: parentCondition.schema,
            },
          },
          {
            properties: {
              [childCondition.scope.replace("#/properties/", "")]: childCondition.schema,
            },
          },
        ],
      },
    },
  };
}

// =============================================================================
// ELEMENT CONVERSION
// =============================================================================

/**
 * Converts a FieldNode from the IR to a ControlElement.
 *
 * The label is sourced from the first `displayName` annotation on the field,
 * matching how the chain DSL propagates the `label` option through the
 * canonicalization phase.
 */
function fieldNodeToControl(field: FieldNode, parentRule?: Rule): ControlElement {
  const displayNameAnnotation = field.annotations.find((a) => a.annotationKind === "displayName");
  const placeholderAnnotation = field.annotations.find((a) => a.annotationKind === "placeholder");
  const label = displayNameAnnotation?.value ?? inferLabelFromFieldName(field.name);

  const control: ControlElement = {
    type: "Control",
    scope: fieldToScope(field.name),
    label,
    ...(placeholderAnnotation !== undefined && {
      options: { placeholder: placeholderAnnotation.value },
    }),
    ...(parentRule !== undefined && { rule: parentRule }),
  };

  return control;
}

/**
 * Converts a GroupLayoutNode from the IR to a GroupLayout element.
 *
 * The group's children are recursively converted; the optional parent rule is
 * forwarded to nested elements so that a group inside a conditional inherits
 * the visibility rule.
 */
function groupNodeToLayout(group: GroupLayoutNode, parentRule?: Rule): GroupLayout {
  return {
    type: "Group",
    label: group.label,
    elements: irElementsToUiSchema(group.elements, parentRule),
    ...(parentRule !== undefined && { rule: parentRule }),
  };
}

/**
 * Converts an array of IR elements to UI Schema elements.
 *
 * @param elements - The IR elements to convert
 * @param parentRule - Optional rule inherited from a parent ConditionalLayoutNode
 * @returns Array of UI Schema elements
 */
function irElementsToUiSchema(
  elements: readonly FormIRElement[],
  parentRule?: Rule
): UISchemaElement[] {
  const result: UISchemaElement[] = [];

  for (const element of elements) {
    switch (element.kind) {
      case "field": {
        result.push(fieldNodeToControl(element, parentRule));
        break;
      }

      case "group": {
        result.push(groupNodeToLayout(element, parentRule));
        break;
      }

      case "conditional": {
        // Build the rule for this conditional level.
        const newRule = createShowRule(element.fieldName, element.value);
        // Combine with the inherited parent rule for nested conditionals.
        const combinedRule = parentRule !== undefined ? combineRules(parentRule, newRule) : newRule;
        // Children are flattened into the parent container with the combined
        // rule attached.
        const childElements = irElementsToUiSchema(element.elements, combinedRule);
        result.push(...childElements);
        break;
      }

      default: {
        const _exhaustive: never = element;
        void _exhaustive;
        throw new Error("Unhandled IR element kind");
      }
    }
  }

  return result;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generates a JSON Forms UI Schema from a canonical `FormIR`.
 *
 * Mapping rules:
 * - `FieldNode` → `ControlElement` with `scope: "#/properties/<name>"`
 * - `displayName` annotation → `label` on the `ControlElement`
 * - `GroupLayoutNode` → `GroupLayout` with recursively converted `elements`
 * - `ConditionalLayoutNode` → children flattened with a `SHOW` rule
 * - Nested conditionals → combined `allOf` rule
 * - Root wrapper is always `{ type: "VerticalLayout", elements: [...] }`
 *
 * @example
 * ```typescript
 * const ir = canonicalizeDSL(
 *   formspec(
 *     group("Customer", field.text("name", { label: "Name" })),
 *     when(is("status", "draft"), field.text("notes", { label: "Notes" })),
 *   )
 * );
 *
 * const uiSchema = generateUiSchemaFromIR(ir);
 * // {
 * //   type: "VerticalLayout",
 * //   elements: [
 * //     {
 * //       type: "Group",
 * //       label: "Customer",
 * //       elements: [{ type: "Control", scope: "#/properties/name", label: "Name" }]
 * //     },
 * //     {
 * //       type: "Control",
 * //       scope: "#/properties/notes",
 * //       label: "Notes",
 * //       rule: { effect: "SHOW", condition: { scope: "#/properties/status", schema: { const: "draft" } } }
 * //     }
 * //   ]
 * // }
 * ```
 *
 * @param ir - The canonical FormIR produced by the Canonicalize phase
 * @returns A validated JSON Forms UI Schema
 */
export function generateUiSchemaFromIR(ir: FormIR): UISchema {
  const result: UISchema = {
    type: "VerticalLayout",
    elements: irElementsToUiSchema(ir.elements),
  };

  return parseOrThrow(uiSchemaValidator, result, "UI Schema");
}
