/**
 * JSON Forms UI Schema generator for FormSpec forms.
 */

import type {
  FormElement,
  FormSpec,
  Group,
  Conditional,
} from "@formspec/core";
import type {
  UISchemaElement,
  UISchema,
  ControlElement,
  GroupLayout,
  Rule,
} from "./types.js";

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
        const conditionalElement = element as Conditional<
          string,
          unknown,
          readonly FormElement[]
        >;
        // Create a rule for this conditional
        const newRule = createShowRule(
          conditionalElement.field,
          conditionalElement.value
        );
        // Combine with parent rule if present (for nested conditionals)
        const combinedRule = parentRule !== undefined
          ? combineRules(parentRule, newRule)
          : newRule;
        // Apply the combined rule to all children
        const childElements = elementsToUiSchema(
          conditionalElement.elements,
          combinedRule
        );
        result.push(...childElements);
        break;
      }
    }
  }

  return result;
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
export function generateUiSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>
): UISchema {
  return {
    type: "VerticalLayout",
    elements: elementsToUiSchema(form.elements),
  };
}
