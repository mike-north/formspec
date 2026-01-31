/**
 * Metadata storage for TC39 Stage 3 decorators.
 *
 * Since Symbol.metadata is not yet available in Node.js 20, we use a different approach:
 * - Field decorators store metadata in a temporary global Map
 * - The class decorator moves this metadata to the final WeakMap keyed by constructor
 *
 * This works because decorators are applied bottom-up (fields first, then class).
 */

import type { EqualsPredicate } from "@formspec/core";

/**
 * Metadata stored for each decorated field.
 */
export interface FieldMetadata {
  /** Display label for the field */
  label?: string;
  /** Whether the field can be empty (default: false, all fields are required) */
  optional?: boolean;
  /** Placeholder text for text fields */
  placeholder?: string;
  /** Minimum value for number fields */
  min?: number;
  /** Maximum value for number fields */
  max?: number;
  /** Static enum options (strings or objects with id/label) */
  enumOptions?: readonly (string | { id: string; label: string })[];
  /** Group name for visual grouping */
  group?: string;
  /** Conditional visibility predicate */
  showWhen?: EqualsPredicate<string, unknown>;
  /** Minimum number of items for array fields */
  minItems?: number;
  /** Maximum number of items for array fields */
  maxItems?: number;
  /** Explicit field type hint (helps runtime conversion) */
  fieldType?: "text" | "number" | "boolean" | "enum" | "array" | "object";
}

/**
 * Symbol used to mark classes that are being decorated.
 * We attach this to the class prototype during field decoration.
 */
const DECORATING_KEY = Symbol("formspec:decorating");

/**
 * Temporary storage for metadata during decoration.
 * Keyed by the unique symbol attached to the class prototype.
 */
const tempMetadataStore = new Map<symbol, Map<string | symbol, FieldMetadata>>();

/**
 * Final storage for class metadata, keyed by constructor.
 */
const classMetadataStore = new WeakMap<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]) => any,
  Map<string | symbol, FieldMetadata>
>();

/**
 * Gets or creates a unique decoration key for a class prototype.
 */
function getOrCreateDecorationKey(prototype: Record<string | symbol, unknown>): symbol {
  let key = prototype[DECORATING_KEY] as symbol | undefined;
  if (!key) {
    key = Symbol("formspec:decorationKey");
    prototype[DECORATING_KEY] = key;
  }
  return key;
}

/**
 * Sets metadata for a field during decoration.
 *
 * @param prototype - The class prototype
 * @param propertyKey - The property name or symbol
 * @param metadata - Partial metadata to merge
 */
export function setFieldMetadata(
  prototype: Record<string | symbol, unknown>,
  propertyKey: string | symbol,
  metadata: Partial<FieldMetadata>
): void {
  const key = getOrCreateDecorationKey(prototype);

  let fieldsMap = tempMetadataStore.get(key);
  if (!fieldsMap) {
    fieldsMap = new Map();
    tempMetadataStore.set(key, fieldsMap);
  }

  const existing = fieldsMap.get(propertyKey) ?? {};
  fieldsMap.set(propertyKey, { ...existing, ...metadata });
}

/**
 * Finalizes metadata for a class by moving it from temporary storage to the WeakMap.
 *
 * This is called lazily when metadata is first accessed.
 *
 * @param constructor - The class constructor
 */
function finalizeClassMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor: new (...args: any[]) => any
): void {
  const prototype = constructor.prototype as Record<string | symbol, unknown>;
  const key = prototype[DECORATING_KEY] as symbol | undefined;

  if (key) {
    const fieldsMap = tempMetadataStore.get(key);
    if (fieldsMap && fieldsMap.size > 0) {
      // Move to final storage
      classMetadataStore.set(constructor, new Map(fieldsMap));

      // Clean up temporary storage
      tempMetadataStore.delete(key);

      // Clean up the decoration key
      delete prototype[DECORATING_KEY];
    }
  }
}

/**
 * Gets all field metadata for a class.
 *
 * @param constructor - The class constructor
 * @returns Map of property names to their metadata
 */
export function getClassMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor: new (...args: any[]) => any
): Map<string | symbol, FieldMetadata> {
  // Try to get from final storage first
  let metadata = classMetadataStore.get(constructor);

  // If not in final storage, try to finalize from temporary storage
  if (!metadata || metadata.size === 0) {
    finalizeClassMetadata(constructor);
    metadata = classMetadataStore.get(constructor);
  }

  return metadata ?? new Map();
}

/**
 * Gets metadata for a specific field.
 *
 * @param constructor - The class constructor
 * @param propertyKey - The property name or symbol
 * @returns The field metadata, or an empty object if none exists
 */
export function getFieldMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor: new (...args: any[]) => any,
  propertyKey: string | symbol
): FieldMetadata {
  const classMetadata = classMetadataStore.get(constructor);
  return classMetadata?.get(propertyKey) ?? {};
}
