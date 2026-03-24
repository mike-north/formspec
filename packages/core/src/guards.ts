/**
 * Type guards for FormSpec form elements.
 *
 * Each guard narrows a {@link FormElement} to a specific field, group, or conditional type.
 */

import type {
  FormElement,
  AnyField,
  TextField,
  NumberField,
  BooleanField,
  StaticEnumField,
  DynamicEnumField,
  DynamicSchemaField,
  ArrayField,
  ObjectField,
  Group,
  Conditional,
  EnumOptionValue,
} from "./types/elements.js";

/** Narrows a FormElement to any field type. */
export function isField(element: FormElement): element is AnyField {
  return element._type === "field";
}

/** Narrows a FormElement to a text input field. */
export function isTextField(element: FormElement): element is TextField<string> {
  return element._type === "field" && element._field === "text";
}

/** Narrows a FormElement to a numeric input field. */
export function isNumberField(element: FormElement): element is NumberField<string> {
  return element._type === "field" && element._field === "number";
}

/** Narrows a FormElement to a boolean checkbox field. */
export function isBooleanField(element: FormElement): element is BooleanField<string> {
  return element._type === "field" && element._field === "boolean";
}

/** Narrows a FormElement to a static enum field. */
export function isStaticEnumField(
  element: FormElement,
): element is StaticEnumField<string, readonly EnumOptionValue[]> {
  return element._type === "field" && element._field === "enum";
}

/** Narrows a FormElement to a dynamic enum field. */
export function isDynamicEnumField(
  element: FormElement,
): element is DynamicEnumField<string, string> {
  return element._type === "field" && element._field === "dynamic_enum";
}

/** Narrows a FormElement to a dynamic schema field. */
export function isDynamicSchemaField(element: FormElement): element is DynamicSchemaField<string> {
  return element._type === "field" && element._field === "dynamic_schema";
}

/** Narrows a FormElement to an array field. */
export function isArrayField(
  element: FormElement,
): element is ArrayField<string, readonly FormElement[]> {
  return element._type === "field" && element._field === "array";
}

/** Narrows a FormElement to an object field. */
export function isObjectField(
  element: FormElement,
): element is ObjectField<string, readonly FormElement[]> {
  return element._type === "field" && element._field === "object";
}

/** Narrows a FormElement to a visual group. */
export function isGroup(element: FormElement): element is Group<readonly FormElement[]> {
  return element._type === "group";
}

/** Narrows a FormElement to a conditional wrapper. */
export function isConditional(
  element: FormElement,
): element is Conditional<string, unknown, readonly FormElement[]> {
  return element._type === "conditional";
}
