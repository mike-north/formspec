/**
 * Zod schemas for JSON Forms UI Schema.
 *
 * These schemas are the source of truth for UI Schema validation.
 * TypeScript types are derived from these schemas via `z.infer<>`.
 *
 * @see https://jsonforms.io/docs/uischema/
 */

import { z } from "zod";

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
 */
export const ruleEffectSchema = z.enum(["SHOW", "HIDE", "ENABLE", "DISABLE"]);

/**
 * Rule effect types for conditional visibility.
 */
export type RuleEffect = z.infer<typeof ruleEffectSchema>;

/**
 * Zod schema for UI Schema element type strings.
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

// Build the Zod schema referencing the pre-declared interface.
// We use z.ZodType<RuleConditionSchema> so the recursive reference works.
// The interface uses `?` (exact optional), and z.ZodType checks output only,
// so the optional fields (which Zod infers as `T | undefined`) are compatible
// because `T | undefined` is assignable to the optional field slot.
//
// @ts-expect-error -- exactOptionalPropertyTypes: the Zod output type for optional
// fields is `T | undefined`, but our interface uses `?` (exact optional, key may
// be absent). This is a known mismatch when using z.ZodType<T> with
// exactOptionalPropertyTypes:true; the runtime behavior is correct.
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
);

// =============================================================================
// Schema-Based Condition and Rule
// =============================================================================

/**
 * Zod schema for a schema-based rule condition.
 */
export const schemaBasedConditionSchema = z
  .object({
    scope: jsonPointerSchema,
    schema: ruleConditionSchema,
  })
  .strict();

/**
 * Condition for a rule.
 */
export type SchemaBasedCondition = z.infer<typeof schemaBasedConditionSchema>;

/**
 * Zod schema for a UI Schema rule.
 */
export const ruleSchema = z
  .object({
    effect: ruleEffectSchema,
    condition: schemaBasedConditionSchema,
  })
  .strict();

/**
 * Rule for conditional element visibility/enablement.
 */
export type Rule = z.infer<typeof ruleSchema>;

// =============================================================================
// UI Schema Element Schemas (recursive via z.lazy)
// =============================================================================

// Forward-declare UISchemaElement so layout schemas can reference it.
// We declare the type up-front and wire the Zod schema below.
/**
 * Union of all UI Schema element types.
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
 */
export type ControlElement = z.infer<typeof controlSchema>;

// -----------------------------------------------------------------------------
// VerticalLayout
// -----------------------------------------------------------------------------

// Pre-declare the interface so the Zod schema can reference UISchemaElement.
/**
 * A vertical layout element.
 */
export interface VerticalLayout {
  type: "VerticalLayout";
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

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
 */
export interface HorizontalLayout {
  type: "HorizontalLayout";
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

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
 */
export interface GroupLayout {
  type: "Group";
  label: string;
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

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
 */
export interface Category {
  type: "Category";
  label: string;
  elements: UISchemaElement[];
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

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
 */
export interface Categorization {
  type: "Categorization";
  elements: Category[];
  label?: string | undefined;
  rule?: Rule | undefined;
  options?: Record<string, unknown> | undefined;
  [k: string]: unknown;
}

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
 */
export type LabelElement = z.infer<typeof labelElementSchema>;

// =============================================================================
// Root UISchema
// =============================================================================

/**
 * Root UI Schema (always a layout — not a Control, Category, or Label).
 */
export type UISchema = VerticalLayout | HorizontalLayout | GroupLayout | Categorization;

/**
 * Zod schema for the root UI Schema (layout types only).
 */
export const uiSchema: z.ZodType<UISchema> = z.lazy(() =>
  z.union([verticalLayoutSchema, horizontalLayoutSchema, groupLayoutSchema, categorizationSchema])
) as z.ZodType<UISchema>;
