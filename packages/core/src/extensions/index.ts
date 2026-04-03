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

import type { BuiltinConstraintName } from "../types/constraint-definitions.js";

// =============================================================================
// REGISTRATION TYPES
// =============================================================================

/**
 * A JSON-serializable payload value used by extension registration hooks.
 *
 * @internal
 */
export type ExtensionPayloadValue =
  | null
  | boolean
  | number
  | string
  | readonly ExtensionPayloadValue[]
  | { readonly [key: string]: ExtensionPayloadValue };

/**
 * Top-level type kinds that extension applicability hooks may inspect.
 *
 * @internal
 */
export type ExtensionTypeKind =
  | "primitive"
  | "enum"
  | "array"
  | "object"
  | "record"
  | "union"
  | "reference"
  | "dynamic"
  | "custom";

/**
 * A curated type shape exposed to extension applicability hooks.
 *
 * This intentionally exposes only the fields needed to determine tag/type
 * applicability without committing the entire canonical IR as public API.
 *
 * @internal
 */
export type ExtensionApplicableType =
  | {
      readonly kind: "primitive";
      readonly primitiveKind: "string" | "number" | "integer" | "bigint" | "boolean" | "null";
    }
  | {
      readonly kind: "custom";
      readonly typeId: string;
      readonly payload: ExtensionPayloadValue;
    }
  | { readonly kind: Exclude<ExtensionTypeKind, "primitive" | "custom"> };

/**
 * Registration for a custom type that maps to a JSON Schema representation.
 *
 * Custom types are referenced by FormSpec's internal custom-type IR nodes and
 * resolved to JSON Schema via `toJsonSchema` during generation.
 *
 * @internal
 */
export interface CustomTypeRegistration {
  /** The type name, unique within the extension. */
  readonly typeName: string;
  /**
   * Optional TypeScript surface names that should resolve to this custom type
   * during TSDoc/class analysis. Defaults to `typeName` when omitted.
   */
  readonly tsTypeNames?: readonly string[];
  /**
   * Converts the custom type's payload into a JSON Schema fragment.
   *
   * @param payload - The opaque JSON payload stored on the custom type node.
   * @param vendorPrefix - The vendor prefix for extension keywords (e.g., "x-stripe").
   * @returns A JSON Schema fragment representing this type.
   */
  readonly toJsonSchema: (
    payload: ExtensionPayloadValue,
    vendorPrefix: string
  ) => Record<string, unknown>;
  /**
   * Optional broadening of built-in constraint tags so they can apply to this
   * custom type without modifying the core built-in constraint tables.
   */
  readonly builtinConstraintBroadenings?: readonly BuiltinConstraintBroadeningRegistration[];
}

/**
 * Registration for a custom constraint that maps to JSON Schema keywords.
 *
 * Custom constraints are referenced by FormSpec's internal custom-constraint nodes.
 *
 * @internal
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
  readonly applicableTypes: readonly ExtensionApplicableType["kind"][] | null;
  /**
   * Optional precise type predicate used when kind-level applicability is too
   * broad (for example, constraints that apply to integer-like primitives but
   * not strings).
   */
  readonly isApplicableToType?: (type: ExtensionApplicableType) => boolean;
  /**
   * Optional comparator for payloads belonging to the same custom constraint.
   * Return values follow the `Array.prototype.sort()` contract.
   */
  readonly comparePayloads?: (left: ExtensionPayloadValue, right: ExtensionPayloadValue) => number;
  /**
   * Optional semantic family metadata for generic contradiction/broadening
   * handling across ordered constraints.
   */
  readonly semanticRole?: ConstraintSemanticRole;
  /**
   * Converts the custom constraint's payload into JSON Schema keywords.
   *
   * @param payload - The opaque JSON payload stored on the custom constraint node.
   * @param vendorPrefix - The vendor prefix for extension keywords.
   * @returns A JSON Schema fragment with the constraint keywords.
   */
  readonly toJsonSchema: (
    payload: ExtensionPayloadValue,
    vendorPrefix: string
  ) => Record<string, unknown>;
}

/**
 * Registration for a custom annotation that may produce JSON Schema keywords.
 *
 * Custom annotations are referenced by FormSpec's internal custom-annotation nodes.
 * They describe or present a field but do not affect which values are valid.
 *
 * @internal
 */
export interface CustomAnnotationRegistration {
  /** The annotation name, unique within the extension. */
  readonly annotationName: string;
  /**
   * Optionally converts the annotation value into JSON Schema keywords.
   * If omitted, the annotation has no JSON Schema representation (UI-only).
   */
  readonly toJsonSchema?: (
    value: ExtensionPayloadValue,
    vendorPrefix: string
  ) => Record<string, unknown>;
}

/**
 * Registration for a vocabulary keyword to include in a JSON Schema `$vocabulary` declaration.
 *
 * @internal
 */
export interface VocabularyKeywordRegistration {
  /** The keyword name (without vendor prefix). */
  readonly keyword: string;
  /** JSON Schema that describes the valid values for this keyword. */
  readonly schema: ExtensionPayloadValue;
}

/**
 * Declarative authoring-side registration for a custom TSDoc constraint tag.
 *
 * @internal
 */
export interface ConstraintTagRegistration {
  /** Tag name without the `@` prefix, e.g. `"maxSigFig"`. */
  readonly tagName: string;
  /** The custom constraint that this tag should produce. */
  readonly constraintName: string;
  /** Parser from raw TSDoc text to JSON-serializable payload. */
  readonly parseValue: (raw: string) => ExtensionPayloadValue;
  /**
   * Optional precise applicability predicate for the field type being parsed.
   * When omitted, the target custom constraint registration controls type
   * applicability during validation.
   */
  readonly isApplicableToType?: (type: ExtensionApplicableType) => boolean;
}

/**
 * Registration for mapping a built-in TSDoc tag onto a custom constraint when
 * it is used on a particular custom type.
 *
 * @internal
 */
export interface BuiltinConstraintBroadeningRegistration {
  /** The built-in tag being broadened, without the `@` prefix. */
  readonly tagName: BuiltinConstraintName;
  /** The custom constraint to emit for this built-in tag. */
  readonly constraintName: string;
  /** Parser from raw TSDoc text to extension payload. */
  readonly parseValue: (raw: string) => ExtensionPayloadValue;
}

/**
 * Semantic metadata for ordered custom constraints that should participate in
 * the generic contradiction/broadening logic.
 *
 * @internal
 */
export interface ConstraintSemanticRole {
  /**
   * Logical family identifier shared by related constraints, for example
   * `"decimal-bound"` or `"date-bound"`.
   */
  readonly family: string;
  /** Whether this constraint acts as a lower or upper bound. */
  readonly bound: "lower" | "upper" | "exact";
  /** Whether equality is allowed when comparing against the bound. */
  readonly inclusive: boolean;
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
 *
 * @internal
 */
export interface ExtensionDefinition {
  /** Globally unique extension identifier, e.g., "x-stripe/monetary". */
  readonly extensionId: string;
  /** Custom type registrations provided by this extension. */
  readonly types?: readonly CustomTypeRegistration[];
  /** Custom constraint registrations provided by this extension. */
  readonly constraints?: readonly CustomConstraintRegistration[];
  /** Authoring-side TSDoc tag registrations provided by this extension. */
  readonly constraintTags?: readonly ConstraintTagRegistration[];
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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
 */
export function defineConstraint(reg: CustomConstraintRegistration): CustomConstraintRegistration {
  return reg;
}

/**
 * Defines a custom TSDoc constraint tag registration.
 *
 * @param reg - The custom tag registration.
 * @returns The same registration, validated at the type level.
 *
 * @internal
 */
export function defineConstraintTag(reg: ConstraintTagRegistration): ConstraintTagRegistration {
  return reg;
}

/**
 * Defines a custom annotation registration. Currently an identity function
 * that provides type-checking and IDE autocompletion.
 *
 * @param reg - The custom annotation registration.
 * @returns The same registration, validated at the type level.
 *
 * @internal
 */
export function defineAnnotation(reg: CustomAnnotationRegistration): CustomAnnotationRegistration {
  return reg;
}
