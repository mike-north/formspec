/**
 * Extension API for registering custom types, constraints, annotations,
 * and vocabulary keywords with FormSpec.
 *
 * Extensions allow third-party packages (e.g., "Decimal", "DateOnly") to
 * plug into the FormSpec pipeline. The types and factory functions defined
 * here are consumed by the FormSpec build pipeline.
 *
 * @packageDocumentation
 */

import type { JsonValue, TypeNode } from "../types/ir.js";

// =============================================================================
// REGISTRATION TYPES
// =============================================================================

/**
 * Registration for a custom type that maps to a JSON Schema representation.
 *
 * Custom types are referenced via {@link CustomTypeNode} in the IR and
 * resolved to JSON Schema via `toJsonSchema` during generation.
 */
export interface CustomTypeRegistration {
  /** The type name, unique within the extension. */
  readonly typeName: string;
  /**
   * Converts the custom type's payload into a JSON Schema fragment.
   *
   * @param payload - The opaque JSON payload from the {@link CustomTypeNode}.
   * @param vendorPrefix - The vendor prefix for extension keywords (e.g., "x-stripe").
   * @returns A JSON Schema fragment representing this type.
   */
  readonly toJsonSchema: (payload: JsonValue, vendorPrefix: string) => Record<string, unknown>;
}

/**
 * Registration for a custom constraint that maps to JSON Schema keywords.
 *
 * Custom constraints are referenced via {@link CustomConstraintNode} in the IR.
 */
export interface CustomConstraintRegistration {
  /** The constraint name, unique within the extension. */
  readonly constraintName: string;
  /**
   * How this constraint composes with other constraints of the same kind.
   * - "intersect": combine with logical AND (both must hold)
   * - "override": last writer wins
   */
  readonly compositionRule: "intersect" | "override";
  /**
   * TypeNode kinds this constraint is applicable to, or `null` for any type.
   * Used by the validator to emit TYPE_MISMATCH diagnostics.
   */
  readonly applicableTypes: readonly TypeNode["kind"][] | null;
  /**
   * Converts the custom constraint's payload into JSON Schema keywords.
   *
   * @param payload - The opaque JSON payload from the {@link CustomConstraintNode}.
   * @param vendorPrefix - The vendor prefix for extension keywords.
   * @returns A JSON Schema fragment with the constraint keywords.
   */
  readonly toJsonSchema: (payload: JsonValue, vendorPrefix: string) => Record<string, unknown>;
}

/**
 * Registration for a custom annotation that may produce JSON Schema keywords.
 *
 * Custom annotations are referenced via {@link CustomAnnotationNode} in the IR.
 * They describe or present a field but do not affect which values are valid.
 */
export interface CustomAnnotationRegistration {
  /** The annotation name, unique within the extension. */
  readonly annotationName: string;
  /**
   * Optionally converts the annotation value into JSON Schema keywords.
   * If omitted, the annotation has no JSON Schema representation (UI-only).
   */
  readonly toJsonSchema?: (value: JsonValue, vendorPrefix: string) => Record<string, unknown>;
}

/**
 * Registration for a vocabulary keyword to include in a JSON Schema `$vocabulary` declaration.
 */
export interface VocabularyKeywordRegistration {
  /** The keyword name (without vendor prefix). */
  readonly keyword: string;
  /** JSON Schema that describes the valid values for this keyword. */
  readonly schema: JsonValue;
}

// =============================================================================
// EXTENSION DEFINITION
// =============================================================================

/**
 * A complete extension definition bundling types, constraints, annotations,
 * and vocabulary keywords.
 *
 * @example
 * ```typescript
 * const monetaryExtension = defineExtension({
 *   extensionId: "x-stripe/monetary",
 *   types: [
 *     defineCustomType({
 *       typeName: "Decimal",
 *       toJsonSchema: (_payload, prefix) => ({
 *         type: "string",
 *         [`${prefix}-decimal`]: true,
 *       }),
 *     }),
 *   ],
 * });
 * ```
 */
export interface ExtensionDefinition {
  /** Globally unique extension identifier, e.g., "x-stripe/monetary". */
  readonly extensionId: string;
  /** Custom type registrations provided by this extension. */
  readonly types?: readonly CustomTypeRegistration[];
  /** Custom constraint registrations provided by this extension. */
  readonly constraints?: readonly CustomConstraintRegistration[];
  /** Custom annotation registrations provided by this extension. */
  readonly annotations?: readonly CustomAnnotationRegistration[];
  /** Vocabulary keyword registrations provided by this extension. */
  readonly vocabularyKeywords?: readonly VocabularyKeywordRegistration[];
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Defines a complete extension. Currently an identity function that provides
 * type-checking and IDE autocompletion for the definition shape.
 *
 * @param def - The extension definition.
 * @returns The same definition, validated at the type level.
 */
export function defineExtension(def: ExtensionDefinition): ExtensionDefinition {
  return def;
}

/**
 * Defines a custom type registration. Currently an identity function that
 * provides type-checking and IDE autocompletion.
 *
 * @param reg - The custom type registration.
 * @returns The same registration, validated at the type level.
 */
export function defineCustomType(reg: CustomTypeRegistration): CustomTypeRegistration {
  return reg;
}

/**
 * Defines a custom constraint registration. Currently an identity function
 * that provides type-checking and IDE autocompletion.
 *
 * @param reg - The custom constraint registration.
 * @returns The same registration, validated at the type level.
 */
export function defineConstraint(reg: CustomConstraintRegistration): CustomConstraintRegistration {
  return reg;
}

/**
 * Defines a custom annotation registration. Currently an identity function
 * that provides type-checking and IDE autocompletion.
 *
 * @param reg - The custom annotation registration.
 * @returns The same registration, validated at the type level.
 */
export function defineAnnotation(reg: CustomAnnotationRegistration): CustomAnnotationRegistration {
  return reg;
}
