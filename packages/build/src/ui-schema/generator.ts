/**
 * JSON Forms UI Schema generator for FormSpec forms.
 */

import type { FormElement, FormSpec, Group, Conditional, ObjectField } from "@formspec/core";
import type { UISchemaElement, UISchema, ControlElement, GroupLayout, Rule } from "./types.js";

/**
 * Converts a field name to a JSON Pointer scope.
 */
function fieldToScope(fieldName: string): string {
  return `#/properties/${fieldName}`;
}

/**
 * Appends a child property segment to a parent scope path.
 */
function nestedScope(parentScope: string, childName: string): string {
  return `${parentScope}/properties/${childName}`;
}

/**
 * Converts elements inside an object field to UI Schema elements,
 * with scoped paths relative to the object's scope.
 *
 * Handles all three element types (field, group, conditional) so that
 * group() and when() nesting inside field.object() works correctly.
 */
function objectElementsToUiSchema(
  elements: readonly FormElement[],
  objectScope: string,
  parentRule?: Rule,
): UISchemaElement[] {
  const result: UISchemaElement[] = [];

  for (const element of elements) {
    switch (element._type) {
      case "field": {
        if (element._field === "object") {
          const nestedObj = element as ObjectField<string, readonly FormElement[]>;
          result.push(
            objectFieldToUiSchema(nestedObj, nestedScope(objectScope, element.name), parentRule),
          );
        } else {
          const control: ControlElement = {
            type: "Control",
            scope: nestedScope(objectScope, element.name),
            ...(element.label !== undefined && { label: element.label }),
            ...(parentRule !== undefined && { rule: parentRule }),
          };
          result.push(control);
        }
        break;
      }

      case "group": {
        const groupElement = element as Group<readonly FormElement[]>;
        const groupLayout: GroupLayout = {
          type: "Group",
          label: groupElement.label,
          elements: objectElementsToUiSchema(groupElement.elements, objectScope, parentRule),
          ...(parentRule !== undefined && { rule: parentRule }),
        };
        result.push(groupLayout);
        break;
      }

      case "conditional": {
        const conditionalElement = element as Conditional<string, unknown, readonly FormElement[]>;
        // The scope for the condition references the field within the object's properties
        const nestedRule: Rule = {
          effect: "SHOW",
          condition: {
            scope: nestedScope(objectScope, conditionalElement.field),
            schema: { const: conditionalElement.value },
          },
        };
        const combinedRule =
          parentRule !== undefined ? combineRules(parentRule, nestedRule) : nestedRule;
        const childElements = objectElementsToUiSchema(
          conditionalElement.elements,
          objectScope,
          combinedRule,
        );
        result.push(...childElements);
        break;
      }
    }
  }

  return result;
}

/**
 * Recursively converts an ObjectField to a GroupLayout containing nested Controls.
 *
 * Delegates to objectElementsToUiSchema to handle all element types (field, group,
 * conditional) inside the object, not just plain fields.
 */
function objectFieldToUiSchema(
  objectField: ObjectField<string, readonly FormElement[]>,
  parentScope: string,
  parentRule?: Rule,
): GroupLayout {
  return {
    type: "Group",
    label: objectField.label ?? objectField.name,
    elements: objectElementsToUiSchema(objectField.properties, parentScope, parentRule),
    ...(parentRule !== undefined && { rule: parentRule }),
  };
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
 * Converts a JSON Forms scope string into a nested properties condition schema.
 *
 * A scope like `#/properties/payment/properties/method` becomes:
 * `{ properties: { payment: { properties: { method: <schema> } } } }`.
 *
 * A scope of `#` (already a combined condition) passes through its schema
 * unchanged — callers must handle that case before calling this function.
 *
 * @param scope - The JSON Pointer scope string (e.g. "#/properties/foo/properties/bar")
 * @param schema - The condition schema to embed at the leaf
 */
function scopeToConditionSchema(
  scope: string,
  schema: import("./types.js").RuleConditionSchema
): import("./types.js").RuleConditionSchema {
  // Strip the leading "#/properties/" prefix and split on "/properties/"
  // to get an array of field name segments, innermost-last.
  const withoutHash = scope.replace(/^#\//, "");
  // Split by "/properties/" — the first segment is also "properties/<name>".
  // We extract just the names: remove the leading "properties/" prefix then split.
  const withoutLeadingProp = withoutHash.replace(/^properties\//, "");
  const fieldNames = withoutLeadingProp.split("/properties/");

  // Build the nested properties structure from inside out (rightmost field first).
  let result: import("./types.js").RuleConditionSchema = schema;
  for (let i = fieldNames.length - 1; i >= 0; i--) {
    const name = fieldNames[i];
    if (name !== undefined) {
      result = { properties: { [name]: result } };
    }
  }
  return result;
}

/**
 * Combines two rules into one using allOf.
 *
 * When elements are nested inside multiple conditionals, all conditions
 * must be met for the element to be visible.
 *
 * Handles nested-scope conditions (e.g. `#/properties/payment/properties/method`)
 * by converting each scope into a properly nested properties structure rather
 * than relying on `replace("#/properties/", "")`, which only strips the first
 * occurrence and produces broken keys like `"payment/properties/method"`.
 */
function combineRules(parentRule: Rule, childRule: Rule): Rule {
  const parentCondition = parentRule.condition;
  const childCondition = childRule.condition;

  // Build the condition schema for each rule, accounting for both
  // flat scopes (#/properties/foo) and nested scopes
  // (#/properties/foo/properties/bar).
  const parentSchema =
    parentCondition.scope === "#"
      ? parentCondition.schema
      : scopeToConditionSchema(parentCondition.scope, parentCondition.schema);

  const childSchema =
    childCondition.scope === "#"
      ? childCondition.schema
      : scopeToConditionSchema(childCondition.scope, childCondition.schema);

  return {
    effect: "SHOW",
    condition: {
      scope: "#",
      schema: {
        allOf: [parentSchema, childSchema],
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
  parentRule?: Rule,
): UISchemaElement[] {
  const result: UISchemaElement[] = [];

  for (const element of elements) {
    switch (element._type) {
      case "field": {
        if (element._field === "object") {
          const objectField = element as ObjectField<string, readonly FormElement[]>;
          result.push(objectFieldToUiSchema(objectField, fieldToScope(element.name), parentRule));
        } else {
          const control: ControlElement = {
            type: "Control",
            scope: fieldToScope(element.name),
            ...(element.label !== undefined && { label: element.label }),
            ...(parentRule !== undefined && { rule: parentRule }),
          };
          result.push(control);
        }
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
  return {
    type: "VerticalLayout",
    elements: elementsToUiSchema(form.elements),
  };
}