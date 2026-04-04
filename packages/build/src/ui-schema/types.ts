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
  /** Literal value the condition schema must equal. */
  const?: unknown;
  /** Allowed values for the condition schema. */
  enum?: readonly unknown[];
  /** JSON Schema type required by the condition schema. */
  type?: string;
  /** Negated branch of the condition schema. */
  not?: RuleConditionSchema;
  /** Inclusive numeric lower bound in the condition schema. */
  minimum?: number;
  /** Inclusive numeric upper bound in the condition schema. */
  maximum?: number;
  /** Exclusive numeric lower bound in the condition schema. */
  exclusiveMinimum?: number;
  /** Exclusive numeric upper bound in the condition schema. */
  exclusiveMaximum?: number;
  /** Inclusive minimum string length in the condition schema. */
  minLength?: number;
  /** Nested property conditions keyed by property name. */
  properties?: Record<string, RuleConditionSchema>;
  /** Property names that must be present for the condition to match. */
  required?: string[];
  /** Schemas that must all match for the condition to succeed. */
  allOf?: RuleConditionSchema[];
}

/**
 * Condition for a rule.
 *
 * @public
 */
export interface SchemaBasedCondition {
  /** JSON Pointer scope the rule evaluates against. */
  readonly scope: string;
  /** JSON Schema fragment evaluated at the scoped location. */
  readonly schema: RuleConditionSchema;
}

/**
 * Rule for conditional element visibility/enablement.
 *
 * @public
 */
export interface Rule {
  /** UI effect to apply when the rule condition matches. */
  readonly effect: RuleEffect;
  /** Predicate that controls when the UI effect applies. */
  readonly condition: SchemaBasedCondition;
}

/**
 * A Control element that binds to a JSON Schema property.
 *
 * @public
 */
export interface ControlElement {
  /** Discriminator identifying a JSON Forms control element. */
  readonly type: "Control";
  /** JSON Pointer scope that this control binds to. */
  readonly scope: string;
  /** Optional label override, or `false` to suppress the label. */
  readonly label?: string | false | undefined;
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific control options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
  readonly [k: string]: unknown;
}

/**
 * A vertical layout element.
 *
 * @public
 */
export interface VerticalLayout {
  /** Discriminator identifying a vertical layout container. */
  readonly type: "VerticalLayout";
  /** Child elements rendered in vertical order. */
  readonly elements: UISchemaElement[];
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific layout options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
  readonly [k: string]: unknown;
}

/**
 * A horizontal layout element.
 *
 * @public
 */
export interface HorizontalLayout {
  /** Discriminator identifying a horizontal layout container. */
  readonly type: "HorizontalLayout";
  /** Child elements rendered side by side. */
  readonly elements: UISchemaElement[];
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific layout options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
  readonly [k: string]: unknown;
}

/**
 * A group element with a label.
 *
 * @public
 */
export interface GroupLayout {
  /** Discriminator identifying a labeled group container. */
  readonly type: "Group";
  /** Group label shown by compatible renderers. */
  readonly label: string;
  /** Child elements rendered inside the group. */
  readonly elements: UISchemaElement[];
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific group options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
  readonly [k: string]: unknown;
}

/**
 * A Category element, used inside a Categorization layout.
 *
 * @public
 */
export interface Category {
  /** Discriminator identifying a category inside a categorization layout. */
  readonly type: "Category";
  /** Category label shown in tabs or step navigation. */
  readonly label: string;
  /** Child elements rendered inside the category. */
  readonly elements: UISchemaElement[];
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific category options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
  readonly [k: string]: unknown;
}

/**
 * A Categorization element (tab-based layout).
 *
 * @public
 */
export interface Categorization {
  /** Discriminator identifying a categorization layout. */
  readonly type: "Categorization";
  /** Categories rendered as tabs or steps. */
  readonly elements: Category[];
  /** Optional label for the overall categorization container. */
  readonly label?: string | undefined;
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific categorization options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
  readonly [k: string]: unknown;
}

/**
 * A Label element for displaying static text.
 *
 * @public
 */
export interface LabelElement {
  /** Discriminator identifying a static text label element. */
  readonly type: "Label";
  /** Static text content rendered by the label element. */
  readonly text: string;
  /** Optional rule controlling visibility or enablement. */
  readonly rule?: Rule | undefined;
  /** Renderer-specific label options. */
  readonly options?: Record<string, unknown> | undefined;
  /** Additional renderer-specific extension properties. */
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
  /** Discriminator for the concrete JSON Forms element type. */
  type: UISchemaElementType;
  /** Optional rule controlling visibility or enablement. */
  rule?: Rule;
  /** Renderer-specific options shared by UI schema elements. */
  options?: Record<string, unknown>;
}
