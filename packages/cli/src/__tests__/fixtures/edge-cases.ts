/**
 * Edge case fixtures for testing type converter and analyzer.
 *
 * These test various TypeScript type patterns that might cause issues.
 */

// ============================================================================
// Complex Union Types
// ============================================================================

/**
 * Mixed type union (not just literals) - should produce oneOf.
 */
export class MixedUnionTypes {
  // string | number - incompatible union
  mixedPrimitive!: string | number;

  // Complex union with object and primitive
  complexUnion!: string | { nested: boolean };

  // Union of different object shapes
  objectUnion!: { type: "a"; valueA: string } | { type: "b"; valueB: number };
}

// ============================================================================
// Nullable and Optional Patterns
// ============================================================================

/**
 * Various nullable patterns.
 */
export class NullablePatterns {
  // Nullable string (T | null)
  nullableString!: string | null;

  // Undefined union (T | undefined) - different from optional
  undefinedString!: string | undefined;

  // Both nullable and optional
  optionalNullable?: string | null;

  // Triple union (T | null | undefined)
  tripleUnion!: string | null | undefined;

  // Nullable enum
  nullableStatus!: "active" | "inactive" | null;
}

// ============================================================================
// Array Edge Cases
// ============================================================================

/**
 * Various array patterns.
 */
export class ArrayEdgeCases {
  // Array of primitives
  strings!: string[];

  // Array of unions
  mixedArray!: (string | number)[];

  // Nullable array
  nullableArray!: string[] | null;

  // Array of objects
  objectArray!: Array<{ id: number; name: string }>;

  // Empty array type (any[])
  anyArray!: unknown[];

  // Nested arrays
  nestedArray!: string[][];
}

// ============================================================================
// Object Edge Cases
// ============================================================================

/**
 * Various object type patterns.
 */
export class ObjectEdgeCases {
  // Empty object
  emptyObject!: {};

  // Record type
  stringRecord!: Record<string, string>;

  // Deeply nested object
  deepNested!: {
    level1: {
      level2: {
        level3: {
          value: string;
        };
      };
    };
  };

  // Object with optional properties
  optionalProps!: {
    required: string;
    optional?: number;
  };
}

// ============================================================================
// Special Types
// ============================================================================

/**
 * Special TypeScript types.
 */
export class SpecialTypes {
  // any type (should handle gracefully)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anyField!: any;

  // unknown type
  unknownField!: unknown;

  // never type (edge case)
  // Note: never is not typically used as a property type

  // void type
  voidField!: void;

  // Date (built-in object)
  dateField!: Date;
}

// ============================================================================
// Enum Variations
// ============================================================================

/**
 * Various enum patterns.
 */
export class EnumVariations {
  // Single literal (degenerates to const)
  singleLiteral!: "only";

  // Number literal enum
  numberEnum!: 1 | 2 | 3;

  // Mixed literal types (should NOT be valid enum)
  // Note: This is a union, not an enum
  mixedLiterals!: "string" | 42;

  // Large enum (many options)
  largeEnum!:
    | "a" | "b" | "c" | "d" | "e"
    | "f" | "g" | "h" | "i" | "j";
}

// ============================================================================
// Class without decorators (for testing analyzer handles undecorated classes)
// ============================================================================

/**
 * Simple class with no decorators for testing analyzer edge cases.
 */
export class NoDecoratorsClass {
  // Regular string field
  name!: string;

  // Optional number field
  count?: number;

  // Boolean field
  active!: boolean;
}

// ============================================================================
// Invalid FormSpec-like Objects (for testing isFormSpec)
// ============================================================================

export const notFormSpec1 = null;
export const notFormSpec2 = undefined;
export const notFormSpec3 = "string";
export const notFormSpec4 = 123;
export const notFormSpec5 = { notElements: [] };
export const notFormSpec6 = { elements: "not-array" };
export const notFormSpec7 = { elements: [{ missingType: true }] };
export const notFormSpec8 = { elements: [null] };
