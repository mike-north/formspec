/**
 * JSON Schema generator for FormSpec forms.
 */

import type {
  FormElement,
  FormSpec,
  AnyField,
  Group,
  Conditional,
  ArrayField,
  ObjectField,
} from "@formspec/core";
import type { JSONSchema7 } from "./types.js";

/**
 * Generates JSON Schema for nested elements (used for array items and object properties).
 */
function generateNestedSchema(elements: readonly FormElement[]): JSONSchema7 {
  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  collectFields(elements, properties, required);

  // Deduplicate required array (can have duplicates when the same field is defined
  // in multiple branches/containers, e.g., repeated in different conditional branches)
  const uniqueRequired = [...new Set(required)];

  return {
    type: "object",
    properties,
    ...(uniqueRequired.length > 0 && { required: uniqueRequired }),
  };
}

/**
 * Converts a single field to its JSON Schema representation.
 */
function fieldToJsonSchema(field: AnyField): JSONSchema7 {
  const base: JSONSchema7 = {};

  if (field.label !== undefined) {
    base.title = field.label;
  }

  switch (field._field) {
    case "text":
      return { ...base, type: "string" };

    case "number":
      return {
        ...base,
        type: "number",
        ...(field.min !== undefined && { minimum: field.min }),
        ...(field.max !== undefined && { maximum: field.max }),
      };

    case "boolean":
      return { ...base, type: "boolean" };

    case "enum": {
      const opts = field.options;
      const isObjectOptions =
        opts.length > 0 &&
        opts.every(
          (opt): opt is { id: string; label: string } =>
            typeof opt === "object" && "id" in opt && "label" in opt
        );
      if (isObjectOptions) {
        // Object options with id/label: use oneOf with const/title
        return {
          ...base,
          type: "string",
          oneOf: opts.map((o) => ({
            const: o.id,
            title: o.label,
          })),
        };
      }
      return { ...base, type: "string", enum: opts as readonly string[] };
    }

    case "dynamic_enum":
      // Dynamic enums are strings at the schema level
      // The actual options are resolved at runtime
      // x-formspec-source indicates the data source key
      // x-formspec-params indicates dependent field names for fetching options
      return {
        ...base,
        type: "string",
        "x-formspec-source": field.source,
        ...(field.params !== undefined &&
          field.params.length > 0 && { "x-formspec-params": field.params }),
      };

    case "dynamic_schema":
      // Dynamic schemas are objects with unknown properties
      // x-formspec-schemaSource indicates where to load the schema from
      return {
        ...base,
        type: "object",
        additionalProperties: true,
        "x-formspec-schemaSource": field.schemaSource,
      };

    case "array": {
      const arrayField = field as ArrayField<string, readonly FormElement[]>;
      return {
        ...base,
        type: "array",
        items: generateNestedSchema(arrayField.items),
        ...(arrayField.minItems !== undefined && { minItems: arrayField.minItems }),
        ...(arrayField.maxItems !== undefined && { maxItems: arrayField.maxItems }),
      };
    }

    case "object": {
      const objectField = field as ObjectField<string, readonly FormElement[]>;
      const nestedSchema = generateNestedSchema(objectField.properties);
      return {
        ...base,
        ...nestedSchema,
      };
    }

    default: {
      // Exhaustiveness check
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

/**
 * Visits all elements in a form tree, collecting fields and required fields.
 */
function collectFields(
  elements: readonly FormElement[],
  properties: Record<string, JSONSchema7>,
  required: string[]
): void {
  for (const element of elements) {
    switch (element._type) {
      case "field":
        properties[element.name] = fieldToJsonSchema(element);
        if (element.required === true) {
          required.push(element.name);
        }
        break;

      case "group":
        // Groups don't affect schema structure, just collect their children
        collectFields(
          (element as Group<readonly FormElement[]>).elements,
          properties,
          required
        );
        break;

      case "conditional":
        // Conditional fields are still part of the schema
        // They're just hidden/shown in the UI
        collectFields(
          (element as Conditional<string, unknown, readonly FormElement[]>)
            .elements,
          properties,
          required
        );
        break;
    }
  }
}

/**
 * Generates a JSON Schema from a FormSpec.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   field.text("name", { label: "Name", required: true }),
 *   field.number("age", { min: 0 }),
 * );
 *
 * const schema = generateJsonSchema(form);
 * // {
 * //   $schema: "https://json-schema.org/draft-07/schema#",
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string", title: "Name" },
 * //     age: { type: "number", minimum: 0 }
 * //   },
 * //   required: ["name"]
 * // }
 * ```
 *
 * @param form - The FormSpec to convert
 * @returns A JSON Schema object
 */
export function generateJsonSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>
): JSONSchema7 {
  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  collectFields(form.elements, properties, required);

  // Deduplicate required array (can have duplicates when the same field is defined
  // in multiple branches/containers, e.g., repeated in different conditional branches)
  const uniqueRequired = [...new Set(required)];

  return {
    $schema: "https://json-schema.org/draft-07/schema#",
    type: "object",
    properties,
    ...(uniqueRequired.length > 0 && { required: uniqueRequired }),
  };
}
