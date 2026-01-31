/**
 * Runtime conversion from decorated classes to FormSpec.
 *
 * This module converts class definitions with decorator metadata into
 * FormSpec form specifications that can be used with renderers.
 */

import type { FormSpec, FormElement, AnyField, Group, Conditional } from "@formspec/core";
import { getClassMetadata, type FieldMetadata } from "./metadata.js";

/**
 * Converts a decorated class to a FormSpec.
 *
 * This function:
 * 1. Reads metadata from the class using getClassMetadata()
 * 2. Determines field types from metadata hints (fieldType property)
 * 3. Builds FormSpec field objects matching core types
 * 4. Groups fields with the same group name into Group elements
 * 5. Wraps conditionally visible fields in Conditional elements
 *
 * @param cls - The decorated class constructor
 * @returns A FormSpec with elements derived from the class
 *
 * @example
 * ```typescript
 * @FormClass()
 * class MyForm {
 *   @Label("Name")
 *   name!: string;
 *
 *   @Label("Age")
 *   @Min(0)
 *   @Optional()
 *   age?: number;
 * }
 *
 * const spec = toFormSpec(MyForm);
 * ```
 *
 * LIMITATIONS (POC):
 * - Requires explicit field type hints from decorators (e.g., @Min sets fieldType: "number")
 * - Does not automatically detect types from TypeScript type annotations at runtime
 * - Nested objects and arrays need additional decorator support
 * - Groups are collected but rendered flat (no nested group structure)
 */
export function toFormSpec<T extends new (...args: unknown[]) => unknown>(
  cls: T
): FormSpec<FormElement[]> {
  // Check if metadata is already finalized
  let metadata = getClassMetadata(cls);

  // If not finalized, create a temporary instance to trigger field initializers
  // This is necessary because TC39 decorators store metadata via addInitializer
  if (metadata.size === 0) {
    try {
      // Create a temporary instance to trigger initializers
      // This will populate metadata on the prototype
      new cls();

      // Metadata should now be on the prototype, read it again
      metadata = getClassMetadata(cls);
    } catch {
      // If construction fails, we'll just work with empty metadata
      // This might happen if the constructor requires arguments
    }
  }

  const elements: FormElement[] = [];

  // Track fields by group name for later grouping
  const groupedFields = new Map<string, AnyField[]>();
  const ungroupedFields: FormElement[] = [];

  // Process each field
  for (const [propertyKey, fieldMeta] of metadata.entries()) {
    // Skip symbol keys for now (rare in practice)
    if (typeof propertyKey === "symbol") {
      continue;
    }

    // Build the field based on metadata
    const field = createField(propertyKey, fieldMeta);

    // Wrap in conditional if needed
    const element = fieldMeta.showWhen ? wrapInConditional(field, fieldMeta) : field;

    // Group or add directly
    if (fieldMeta.group) {
      const groupFields = groupedFields.get(fieldMeta.group) ?? [];
      groupFields.push(field); // Note: conditionals around grouped fields not fully supported in POC
      groupedFields.set(fieldMeta.group, groupFields);
    } else {
      ungroupedFields.push(element);
    }
  }

  // Build groups
  for (const [groupName, fields] of groupedFields.entries()) {
    const group: Group<AnyField[]> = {
      _type: "group",
      label: groupName,
      elements: fields,
    };
    elements.push(group);
  }

  // Add ungrouped fields
  elements.push(...ungroupedFields);

  return { elements };
}

/**
 * Creates a field element from property metadata.
 *
 * The field type is determined by the fieldType hint in metadata, which is set
 * by decorators like @Min (sets "number"), @Placeholder (sets "text"), etc.
 *
 * If no fieldType hint is present, defaults to text field.
 */
function createField(name: string, meta: FieldMetadata): AnyField {
  const required = !meta.optional;

  // Determine field type from metadata hints
  switch (meta.fieldType) {
    case "number":
      return {
        _type: "field" as const,
        _field: "number" as const,
        name,
        ...(meta.label !== undefined && { label: meta.label }),
        ...(meta.min !== undefined && { min: meta.min }),
        ...(meta.max !== undefined && { max: meta.max }),
        ...(required !== undefined && { required }),
      };

    case "boolean":
      return {
        _type: "field" as const,
        _field: "boolean" as const,
        name,
        ...(meta.label !== undefined && { label: meta.label }),
        ...(required !== undefined && { required }),
      };

    case "enum":
      if (!meta.enumOptions) {
        throw new Error(`Field ${name} marked as enum but has no options`);
      }
      return {
        _type: "field" as const,
        _field: "enum" as const,
        name,
        options: meta.enumOptions,
        ...(meta.label !== undefined && { label: meta.label }),
        ...(required !== undefined && { required }),
      };

    case "array":
      // POC limitation: array items need to be defined separately
      // For now, create a placeholder array field
      return {
        _type: "field" as const,
        _field: "array" as const,
        name,
        items: [], // TODO: Support nested item schemas
        ...(meta.label !== undefined && { label: meta.label }),
        ...(required !== undefined && { required }),
        ...(meta.minItems !== undefined && { minItems: meta.minItems }),
        ...(meta.maxItems !== undefined && { maxItems: meta.maxItems }),
      };

    case "object":
      // POC limitation: object properties need to be defined separately
      return {
        _type: "field" as const,
        _field: "object" as const,
        name,
        properties: [], // TODO: Support nested property schemas
        ...(meta.label !== undefined && { label: meta.label }),
        ...(required !== undefined && { required }),
      };

    case "text":
    default:
      // Default to text field
      return {
        _type: "field" as const,
        _field: "text" as const,
        name,
        ...(meta.label !== undefined && { label: meta.label }),
        ...(meta.placeholder !== undefined && { placeholder: meta.placeholder }),
        ...(required !== undefined && { required }),
      };
  }
}

/**
 * Wraps a field in a Conditional element based on showWhen metadata.
 */
function wrapInConditional(field: AnyField, meta: FieldMetadata): Conditional<string, unknown, [AnyField]> {
  if (!meta.showWhen) {
    throw new Error("wrapInConditional called without showWhen metadata");
  }

  return {
    _type: "conditional",
    field: meta.showWhen.field,
    value: meta.showWhen.value,
    elements: [field],
  };
}
