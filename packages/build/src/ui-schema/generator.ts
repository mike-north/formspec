/**
 * JSON Forms UI Schema generator for FormSpec forms.
 */

import type { FormElement, FormSpec, Group, Conditional } from "@formspec/core";
import type { UISchemaElement, UISchema, ControlElement, GroupLayout, Rule } from "./types.js";
import { uiSchema as uiSchemaValidator } from "./schema.js";
import type { FormSpecField } from "../analyzer/type-converter.js";
import { z } from "zod";

/**
 * Parses a value through a Zod schema, converting validation errors to a descriptive Error.
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
 * Converts a field name to a JSON Pointer scope.
 */
function fieldToScope(fieldName: string): string {
  return `#/properties/${fieldName}`;
}

/**
 * Creates a rule for conditional visibility.
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
 * Combines two rules into one using allOf.
 *
 * When elements are nested inside multiple conditionals, all conditions
 * must be met for the element to be visible.
 */
function combineRules(parentRule: Rule, childRule: Rule): Rule {
  // Both rules should have the same effect (SHOW)
  // Combine conditions using allOf
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

/**
 * Converts form elements to UI Schema elements.
 *
 * @param elements - The form elements to convert
 * @param parentRule - Optional rule inherited from parent conditional
 * @returns Array of UI Schema elements
 */
function elementsToUiSchema(
  elements: readonly FormElement[],
  parentRule?: Rule
): UISchemaElement[] {
  const result: UISchemaElement[] = [];

  for (const element of elements) {
    switch (element._type) {
      case "field": {
        const control: ControlElement = {
          type: "Control",
          scope: fieldToScope(element.name),
          ...(element.label !== undefined && { label: element.label }),
          ...(parentRule !== undefined && { rule: parentRule }),
        };
        result.push(control);
        break;
      }

      case "group": {
        const groupElement = element as Group<readonly FormElement[]>;
        const group: GroupLayout = {
          type: "Group",
          label: groupElement.label,
          elements: elementsToUiSchema(groupElement.elements, parentRule),
          ...(parentRule !== undefined && { rule: parentRule }),
        };
        result.push(group);
        break;
      }

      case "conditional": {
        const conditionalElement = element as Conditional<string, unknown, readonly FormElement[]>;
        // Create a rule for this conditional
        const newRule = createShowRule(conditionalElement.field, conditionalElement.value);
        // Combine with parent rule if present (for nested conditionals)
        const combinedRule = parentRule !== undefined ? combineRules(parentRule, newRule) : newRule;
        // Apply the combined rule to all children
        const childElements = elementsToUiSchema(conditionalElement.elements, combinedRule);
        result.push(...childElements);
        break;
      }
    }
  }

  return result;
}

/**
 * Converts a single FormSpecField to a ControlElement, resolving showWhen into a rule.
 *
 * @param field - The FormSpecField to convert
 * @param scopePrefix - The JSON Pointer prefix for the field's scope
 * @returns A ControlElement
 */
function formSpecFieldToElement(
  field: FormSpecField,
  scopePrefix = "#/properties"
): ControlElement {
  const control: ControlElement = {
    type: "Control",
    scope: `${scopePrefix}/${field.id}`,
  };

  if (field.label !== undefined) {
    control.label = field.label;
  }

  if (
    field.showWhen !== undefined &&
    typeof field.showWhen === "object" &&
    "field" in field.showWhen &&
    "value" in field.showWhen
  ) {
    const sw = field.showWhen as { field: string; value: unknown };
    control.rule = {
      effect: "SHOW",
      condition: {
        scope: `#/properties/${sw.field}`,
        schema: { const: sw.value },
      },
    };
  }

  return control;
}

/**
 * Converts FormSpecField[] (from decorator/interface/type analysis) to a JSON Forms UISchema.
 *
 * Mapping:
 * - Each field → `{ type: "Control", scope: "#/properties/{id}", label? }`
 * - `showWhen: { field, value }` → rule with SHOW effect
 * - `group` property → Groups fields by group name, preserving insertion order
 * - `fields` (nested object) → single Control pointing to the object property
 * - Root wrapper → `{ type: "VerticalLayout", elements }`
 *
 * @param fields - The FormSpecField array to convert
 * @returns A JSON Forms UISchema
 */
export function generateUiSchemaFromFields(fields: FormSpecField[]): UISchema {
  // Collect elements, grouping by the `group` property.
  // Map preserves insertion order — first occurrence of a group name determines its position.
  const groupMap = new Map<string, ControlElement[]>();
  const orderedKeys: (string | null)[] = []; // null = ungrouped slot
  const ungrouped: ControlElement[] = [];

  for (const field of fields) {
    const element = formSpecFieldToElement(field);

    if (field.group !== undefined) {
      if (!groupMap.has(field.group)) {
        groupMap.set(field.group, []);
        orderedKeys.push(field.group);
      }
      // We know the key exists since we just set it above.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      groupMap.get(field.group)!.push(element);
    } else {
      // Track position for ungrouped fields relative to grouped fields.
      // Use a sentinel to mark the slot for ungrouped elements inline.
      orderedKeys.push(null);
      ungrouped.push(element);
    }
  }

  // Build the flat elements list respecting insertion order.
  const elements: UISchemaElement[] = [];
  let ungroupedIndex = 0;

  for (const key of orderedKeys) {
    if (key === null) {
      // Ungrouped field — emit directly.
      const el = ungrouped[ungroupedIndex++];
      if (el !== undefined) {
        elements.push(el);
      }
    } else {
      // Each group key appears in orderedKeys exactly once (guarded by
      // `!groupMap.has()` above), so we emit the Group element directly.
      const groupElements = groupMap.get(key) ?? [];
      const groupLayout: GroupLayout = {
        type: "Group",
        label: key,
        elements: groupElements,
      };
      elements.push(groupLayout);
    }
  }

  const result: UISchema = {
    type: "VerticalLayout",
    elements,
  };

  return parseOrThrow(uiSchemaValidator, result, "UI Schema");
}

/**
 * Generates a JSON Forms UI Schema from a FormSpec.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   group("Customer",
 *     field.text("name", { label: "Name" }),
 *   ),
 *   when("status", "draft",
 *     field.text("notes", { label: "Notes" }),
 *   ),
 * );
 *
 * const uiSchema = generateUiSchema(form);
 * // {
 * //   type: "VerticalLayout",
 * //   elements: [
 * //     {
 * //       type: "Group",
 * //       label: "Customer",
 * //       elements: [
 * //         { type: "Control", scope: "#/properties/name", label: "Name" }
 * //       ]
 * //     },
 * //     {
 * //       type: "Control",
 * //       scope: "#/properties/notes",
 * //       label: "Notes",
 * //       rule: {
 * //         effect: "SHOW",
 * //         condition: { scope: "#/properties/status", schema: { const: "draft" } }
 * //       }
 * //     }
 * //   ]
 * // }
 * ```
 *
 * @param form - The FormSpec to convert
 * @returns A JSON Forms UI Schema
 */
export function generateUiSchema<E extends readonly FormElement[]>(form: FormSpec<E>): UISchema {
  const result: UISchema = {
    type: "VerticalLayout",
    elements: elementsToUiSchema(form.elements),
  };

  return parseOrThrow(uiSchemaValidator, result, "UI Schema");
}
