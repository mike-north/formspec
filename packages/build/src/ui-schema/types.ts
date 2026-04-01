/**
 * JSON Forms UI Schema type definitions.
 *
 * These are the consumer-facing TypeScript shapes. Runtime validation remains
 * defined separately in `./schema.ts`.
 *
 * See: https://jsonforms.io/docs/uischema/
 */

/**
 * Rule effect types for conditional visibility.
 *
 * @public
 */
export type RuleEffect = "SHOW" | "HIDE" | "ENABLE" | "DISABLE";

/**
 * UI Schema element types.
 *
 * @public
 */
export type UISchemaElementType =
  | "Control"
  | "VerticalLayout"
  | "HorizontalLayout"
  | "Group"
  | "Categorization"
  | "Category"
  | "Label";

/**
 * JSON Schema subset used in rule conditions.
 *
 * @public
 */
export interface RuleConditionSchema {
  const?: unknown;
  enum?: readonly unknown[];
  type?: string;
  not?: RuleConditionSchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  properties?: Record<string, RuleConditionSchema>;
  required?: string[];
  allOf?: RuleConditionSchema[];
}

/**
 * Condition for a rule.
 *
 * @public
 */
export interface SchemaBasedCondition {
  readonly scope: string;
  readonly schema: RuleConditionSchema;
}

/**
 * Rule for conditional element visibility/enablement.
 *
 * @public
 */
export interface Rule {
  readonly effect: RuleEffect;
  readonly condition: SchemaBasedCondition;
}

/**
 * A Control element that binds to a JSON Schema property.
 *
 * @public
 */
export interface ControlElement {
  readonly type: "Control";
  readonly scope: string;
  readonly label?: string | false | undefined;
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * A vertical layout element.
 *
 * @public
 */
export interface VerticalLayout {
  readonly type: "VerticalLayout";
  readonly elements: UISchemaElement[];
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * A horizontal layout element.
 *
 * @public
 */
export interface HorizontalLayout {
  readonly type: "HorizontalLayout";
  readonly elements: UISchemaElement[];
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * A group element with a label.
 *
 * @public
 */
export interface GroupLayout {
  readonly type: "Group";
  readonly label: string;
  readonly elements: UISchemaElement[];
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * A Category element, used inside a Categorization layout.
 *
 * @public
 */
export interface Category {
  readonly type: "Category";
  readonly label: string;
  readonly elements: UISchemaElement[];
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * A Categorization element (tab-based layout).
 *
 * @public
 */
export interface Categorization {
  readonly type: "Categorization";
  readonly elements: Category[];
  readonly label?: string | undefined;
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * A Label element for displaying static text.
 *
 * @public
 */
export interface LabelElement {
  readonly type: "Label";
  readonly text: string;
  readonly rule?: Rule | undefined;
  readonly options?: Record<string, unknown> | undefined;
  readonly [k: string]: unknown;
}

/**
 * Union of all UI Schema element types.
 *
 * @public
 */
export type UISchemaElement =
  | ControlElement
  | VerticalLayout
  | HorizontalLayout
  | GroupLayout
  | Categorization
  | Category
  | LabelElement;

/**
 * Root UI Schema (always a layout — not a Control, Category, or Label).
 *
 * @public
 */
export type UISchema = VerticalLayout | HorizontalLayout | GroupLayout | Categorization;

/**
 * Base interface for all UI Schema elements.
 *
 * This is a manually maintained interface representing the common shape
 * shared by all element types. It is kept as an interface (rather than
 * derived from Zod) because it is the base of a discriminated union, not
 * a union member itself.
 *
 * @public
 */
export interface UISchemaElementBase {
  type: UISchemaElementType;
  rule?: Rule;
  options?: Record<string, unknown>;
}
