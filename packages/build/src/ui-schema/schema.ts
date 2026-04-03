/**
 * Zod schemas for JSON Forms UI Schema.
 *
 * These schemas are the source of truth for UI Schema validation.
 * TypeScript types are derived from these schemas via `z.infer<>`.
 *
 * @see https://jsonforms.io/docs/uischema/
 */

import { z } from "zod";
import type { UISchema } from "./types.js";

// =============================================================================
// Primitive helpers
// =============================================================================

/** JSON Pointer string (e.g., "#/properties/fieldName") */
const jsonPointerSchema = z.string();

// =============================================================================
// Rule Effect and Element Type enums
// =============================================================================

/**
 * Zod schema for rule effect values.
 *
 * @internal
 */
export const ruleEffectSchema = z.enum(["SHOW", "HIDE", "ENABLE", "DISABLE"]);

/**
 * Rule effect types for conditional visibility.
 *
 * @internal
 */
export type RuleEffect = z.infer<typeof ruleEffectSchema>;

/**
 * Zod schema for UI Schema element type strings.
 *
 * @internal
 */
export const uiSchemaElementTypeSchema = z.enum([
  "Control",
  "VerticalLayout",
  "HorizontalLayout",
  "Group",
  "Categorization",
  "Category",
  "Label",
]);

/**
 * UI Schema element types.
 *
 * @internal
 */
export type UISchemaElementType = z.infer<typeof uiSchemaElementTypeSchema>;

// =============================================================================
// Rule Condition Schema (recursive)
// =============================================================================

// Forward-declare the recursive TypeScript type.
// We use an interface here (rather than z.infer<>) because the recursive
// z.lazy() type annotation requires us to pre-declare the shape.
/**
 * JSON Schema subset used in rule conditions.
 *
 * @internal
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
 * Zod schema for the rule-condition JSON Schema subset.
 *
 * @internal
 */
export const ruleConditionSchema: z.ZodType<RuleConditionSchema> = z.lazy(() =>
  z
    .object({
      const: z.unknown().optional(),
      enum: z.array(z.unknown()).readonly().optional(),
      type: z.string().optional(),
      not: ruleConditionSchema.optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      minLength: z.number().optional(),
      properties: z.record(z.string(), ruleConditionSchema).optional(),
      required: z.array(z.string()).optional(),
      allOf: z.array(ruleConditionSchema).optional(),
    })
    .strict()
) as z.ZodType<RuleConditionSchema>;

// =============================================================================
// Schema-Based Condition and Rule
// =============================================================================

/**
 * Zod schema for a schema-based rule condition.
 *
 * @internal
 */
export const schemaBasedConditionSchema = z
  .object({
    scope: jsonPointerSchema,
    schema: ruleConditionSchema,
  })
  .strict();

/**
 * Condition for a rule.
 *
 * @internal
 */
export type SchemaBasedCondition = z.infer<typeof schemaBasedConditionSchema>;

/**
 * Zod schema for a UI Schema rule.
 *
 * @internal
 */
export const ruleSchema = z
  .object({
    effect: ruleEffectSchema,
    condition: schemaBasedConditionSchema,
  })
  .strict();

/**
 * Rule for conditional element visibility/enablement.
 *
 * @internal
 */
export type Rule = z.infer<typeof ruleSchema>;

// =============================================================================
// UI Schema Element Schemas (recursive via z.lazy)
// =============================================================================

// Forward-declare UISchemaElement so layout schemas can reference it.
// We declare the type up-front and wire the Zod schema below.
/**
 * Union of all UI Schema element types.
 *
 * @internal
 */
export type UISchemaElement =
  | ControlElement
  | VerticalLayout
  | HorizontalLayout
  | GroupLayout
  | Categorization
  | Category
  | LabelElement;

// The Zod schema for UISchemaElement is defined as a const using z.lazy(),
// which defers evaluation until first use. This allows all element schemas
// below to be referenced even though they are declared after this line.
/**
 * Zod schema for any UI Schema element.
 *
 * @internal
 */
export const uiSchemaElementSchema: z.ZodType<UISchemaElement> = z.lazy(() =>
  z.union([
    controlSchema,
    verticalLayoutSchema,
    horizontalLayoutSchema,
    groupLayoutSchema,
    categorizationSchema,
    categorySchema,
    labelElementSchema,
  ])
) as z.ZodType<UISchemaElement>;

// -----------------------------------------------------------------------------
// Control
// -----------------------------------------------------------------------------

/**
 * Zod schema for a Control element.
 *
 * @internal
 */
export const controlSchema = z
  .object({
    type: z.literal("Control"),
    scope: jsonPointerSchema,
    label: z.union([z.string(), z.literal(false)]).optional(),
    rule: ruleSchema.optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

/**
 * A Control element that binds to a JSON Schema property.
 *
 * @internal
 */
export type ControlElement = z.infer<typeof controlSchema>;

// -----------------------------------------------------------------------------
// VerticalLayout
// -----------------------------------------------------------------------------

// Pre-declare the interface so the Zod schema can reference UISchemaElement.
/**
 * A vertical layout element.
 *
 * @internal
 */
export interface VerticalLayout {
  type: "VerticalLayout";
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

/**
 * Zod schema for a vertical layout element.
 *
 * @internal
 */
export const verticalLayoutSchema: z.ZodType<VerticalLayout> = z.lazy(() =>
  z
    .object({
      type: z.literal("VerticalLayout"),
      elements: z.array(uiSchemaElementSchema),
      rule: ruleSchema.optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
);

// -----------------------------------------------------------------------------
// HorizontalLayout
// -----------------------------------------------------------------------------

/**
 * A horizontal layout element.
 *
 * @internal
 */
export interface HorizontalLayout {
  type: "HorizontalLayout";
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

/**
 * Zod schema for a horizontal layout element.
 *
 * @internal
 */
export const horizontalLayoutSchema: z.ZodType<HorizontalLayout> = z.lazy(() =>
  z
    .object({
      type: z.literal("HorizontalLayout"),
      elements: z.array(uiSchemaElementSchema),
      rule: ruleSchema.optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
);

// -----------------------------------------------------------------------------
// GroupLayout
// -----------------------------------------------------------------------------

/**
 * A group element with a label.
 *
 * @internal
 */
export interface GroupLayout {
  type: "Group";
  label: string;
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

/**
 * Zod schema for a group layout element.
 *
 * @internal
 */
export const groupLayoutSchema: z.ZodType<GroupLayout> = z.lazy(() =>
  z
    .object({
      type: z.literal("Group"),
      label: z.string(),
      elements: z.array(uiSchemaElementSchema),
      rule: ruleSchema.optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
);

// -----------------------------------------------------------------------------
// Category
// -----------------------------------------------------------------------------

/**
 * A Category element, used inside a Categorization layout.
 *
 * @internal
 */
export interface Category {
  type: "Category";
  label: string;
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

/**
 * Zod schema for a category element.
 *
 * @internal
 */
export const categorySchema: z.ZodType<Category> = z.lazy(() =>
  z
    .object({
      type: z.literal("Category"),
      label: z.string(),
      elements: z.array(uiSchemaElementSchema),
      rule: ruleSchema.optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
);

// -----------------------------------------------------------------------------
// Categorization
// -----------------------------------------------------------------------------

/**
 * A Categorization element (tab-based layout).
 *
 * @internal
 */
export interface Categorization {
  type: "Categorization";
  elements: Category[];
  label?: string | undefined;
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

/**
 * Zod schema for a categorization element.
 *
 * @internal
 */
export const categorizationSchema: z.ZodType<Categorization> = z.lazy(() =>
  z
    .object({
      type: z.literal("Categorization"),
      elements: z.array(categorySchema),
      label: z.string().optional(),
      rule: ruleSchema.optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
);

// -----------------------------------------------------------------------------
// LabelElement
// -----------------------------------------------------------------------------

/**
 * Zod schema for a Label element.
 *
 * @internal
 */
export const labelElementSchema = z
  .object({
    type: z.literal("Label"),
    text: z.string(),
    rule: ruleSchema.optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

/**
 * A Label element for displaying static text.
 *
 * @internal
 */
export type LabelElement = z.infer<typeof labelElementSchema>;

// =============================================================================
// Root UISchema
// =============================================================================

/**
 * Zod schema for the root UI Schema (layout types only).
 *
 * @public
 */
export const uiSchema: z.ZodType<UISchema> = z.lazy(() =>
  z.union([verticalLayoutSchema, horizontalLayoutSchema, groupLayoutSchema, categorizationSchema])
) as z.ZodType<UISchema>;
