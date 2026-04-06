/**
 * JSON Forms UI Schema generator that operates on the canonical FormIR.
 *
 * This generator consumes the IR produced by the Canonicalize phase and
 * produces a JSON Forms UI Schema. All downstream UI Schema generation
 * should use this module for UI Schema generation.
 */

import type { FormIR, FormIRElement, FieldNode, GroupLayoutNode } from "@formspec/core/internals";
import { getDisplayName, getSerializedName } from "../metadata/index.js";
import { assertNoSerializedNameCollisions } from "../metadata/collision-guards.js";
import type {
  UISchema,
  UISchemaElement,
  ControlElement,
  GroupLayout,
  Rule,
  RuleConditionSchema,
} from "./types.js";
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
 * must be met for the element to be visible. This function flattens both
 * conditions into a single rule using a top-level allOf so JSON Forms evaluates
 * every predicate simultaneously without nesting rule fragments.
 */
function flattenConditionSchema(scope: string, schema: RuleConditionSchema): RuleConditionSchema[] {
  if (schema.allOf === undefined) {
    if (scope === "#") {
      return [schema];
    }

    const fieldName = scope.replace("#/properties/", "");
    return [
      {
        properties: {
          [fieldName]: schema,
        },
      },
    ];
  }

  return schema.allOf.flatMap((member) => flattenConditionSchema(scope, member));
}

function combineRules(parentRule: Rule, childRule: Rule): Rule {
  return {
    effect: "SHOW",
    condition: {
      scope: "#",
      schema: {
        allOf: [
          ...flattenConditionSchema(parentRule.condition.scope, parentRule.condition.schema),
          ...flattenConditionSchema(childRule.condition.scope, childRule.condition.schema),
        ],
      },
    },
  };
}

function getFieldDisplayName(field: FieldNode): string | undefined {
  const resolvedDisplayName = getDisplayName(field.metadata);
  if (resolvedDisplayName !== undefined) {
    return resolvedDisplayName;
  }

  return field.annotations.find((annotation) => annotation.annotationKind === "displayName")?.value;
}

// =============================================================================
// ELEMENT CONVERSION
// =============================================================================

/**
 * Converts a FieldNode from the IR to a ControlElement.
 *
 * The label prefers resolved metadata, with annotation fallback for callers
 * that still construct IR without the metadata resolver pass.
 */
function fieldNodeToControl(field: FieldNode, fieldNameMap: ReadonlyMap<string, string>, parentRule?: Rule): ControlElement {
  const placeholderAnnotation = field.annotations.find((a) => a.annotationKind === "placeholder");
  const serializedName = fieldNameMap.get(field.name) ?? getSerializedName(field.name, field.metadata);
  const displayName = getFieldDisplayName(field);

  const control: ControlElement = {
    type: "Control",
    scope: fieldToScope(serializedName),
    ...(displayName !== undefined && { label: displayName }),
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
function groupNodeToLayout(
  group: GroupLayoutNode,
  fieldNameMap: ReadonlyMap<string, string>,
  parentRule?: Rule
): GroupLayout {
  return {
    type: "Group",
    label: group.label,
    elements: irElementsToUiSchema(group.elements, fieldNameMap, parentRule),
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
  fieldNameMap: ReadonlyMap<string, string>,
  parentRule?: Rule
): UISchemaElement[] {
  const result: UISchemaElement[] = [];

  for (const element of elements) {
    switch (element.kind) {
      case "field": {
        result.push(fieldNodeToControl(element, fieldNameMap, parentRule));
        break;
      }

      case "group": {
        result.push(groupNodeToLayout(element, fieldNameMap, parentRule));
        break;
      }

      case "conditional": {
        // Build the rule for this conditional level.
        const newRule = createShowRule(fieldNameMap.get(element.fieldName) ?? element.fieldName, element.value);
        // Combine with the inherited parent rule for nested conditionals.
        const combinedRule = parentRule !== undefined ? combineRules(parentRule, newRule) : newRule;
        // Children are flattened into the parent container with the combined
        // rule attached.
        const childElements = irElementsToUiSchema(element.elements, fieldNameMap, combinedRule);
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
 * - resolved `displayName` metadata → `label` on the `ControlElement`
 * - `displayName` annotation → fallback `label` when metadata is absent
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
  assertNoSerializedNameCollisions(ir);
  const fieldNameMap = collectFieldNameMap(ir.elements);
  const result: UISchema = {
    type: "VerticalLayout",
    elements: irElementsToUiSchema(ir.elements, fieldNameMap),
  };

  return parseOrThrow(uiSchemaValidator, result, "UI Schema");
}

function collectFieldNameMap(elements: readonly FormIRElement[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();

  for (const element of elements) {
    switch (element.kind) {
      case "field":
        map.set(element.name, getSerializedName(element.name, element.metadata));
        break;
      case "group":
      case "conditional":
        for (const [key, value] of collectFieldNameMap(element.elements)) {
          map.set(key, value);
        }
        break;
      default: {
        const _exhaustive: never = element;
        void _exhaustive;
      }
    }
  }

  return map;
}
