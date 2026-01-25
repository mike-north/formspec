/**
 * JSON Forms UI Schema type definitions.
 *
 * These types define the UI layout structure for JSON Forms.
 * See: https://jsonforms.io/docs/uischema/
 */

/**
 * UI Schema element types.
 */
export type UISchemaElementType =
  | "Control"
  | "VerticalLayout"
  | "HorizontalLayout"
  | "Group"
  | "Categorization"
  | "Category";

/**
 * Rule effect types for conditional visibility.
 */
export type RuleEffect = "SHOW" | "HIDE" | "ENABLE" | "DISABLE";

/**
 * JSON Schema subset for rule conditions.
 */
export interface RuleConditionSchema {
  const?: unknown;
  enum?: readonly unknown[];
  type?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, RuleConditionSchema>;
  allOf?: RuleConditionSchema[];
}

/**
 * Condition for a rule.
 */
export interface SchemaBasedCondition {
  scope: string;
  schema: RuleConditionSchema;
}

/**
 * Rule for conditional element visibility/enablement.
 */
export interface Rule {
  effect: RuleEffect;
  condition: SchemaBasedCondition;
}

/**
 * Base interface for all UI Schema elements.
 */
export interface UISchemaElementBase {
  type: UISchemaElementType;
  rule?: Rule;
  options?: Record<string, unknown>;
}

/**
 * A Control element that binds to a JSON Schema property.
 */
export interface ControlElement extends UISchemaElementBase {
  type: "Control";
  scope: string;
  label?: string;
}

/**
 * A vertical layout element.
 */
export interface VerticalLayout extends UISchemaElementBase {
  type: "VerticalLayout";
  elements: UISchemaElement[];
}

/**
 * A horizontal layout element.
 */
export interface HorizontalLayout extends UISchemaElementBase {
  type: "HorizontalLayout";
  elements: UISchemaElement[];
}

/**
 * A group element with a label.
 */
export interface GroupLayout extends UISchemaElementBase {
  type: "Group";
  label: string;
  elements: UISchemaElement[];
}

/**
 * Union of all UI Schema element types.
 */
export type UISchemaElement =
  | ControlElement
  | VerticalLayout
  | HorizontalLayout
  | GroupLayout;

/**
 * Root UI Schema (always a layout).
 */
export type UISchema = VerticalLayout | HorizontalLayout | GroupLayout;
