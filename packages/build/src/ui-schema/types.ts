/**
 * JSON Forms UI Schema type definitions.
 *
 * Types are derived from Zod schemas in ./schema.ts.
 * See: https://jsonforms.io/docs/uischema/
 */

export type {
  RuleConditionSchema,
  SchemaBasedCondition,
  Rule,
  RuleEffect,
  ControlElement,
  VerticalLayout,
  HorizontalLayout,
  GroupLayout,
  Categorization,
  Category,
  LabelElement,
  UISchemaElement,
  UISchemaElementType,
  UISchema,
} from "./schema.js";

import type { Rule, UISchemaElementType } from "./schema.js";

/**
 * Base interface for all UI Schema elements.
 *
 * This is a manually maintained interface representing the common shape
 * shared by all element types. It is kept as an interface (rather than
 * derived from Zod) because it is the base of a discriminated union, not
 * a union member itself.
 */
export interface UISchemaElementBase {
  type: UISchemaElementType;
  rule?: Rule;
  options?: Record<string, unknown>;
}
