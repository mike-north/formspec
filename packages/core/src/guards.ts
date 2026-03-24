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

export function isField(element: FormElement): element is AnyField {
  return element._type === "field";
}

export function isTextField(element: FormElement): element is TextField<string> {
  return element._type === "field" && element._field === "text";
}

export function isNumberField(element: FormElement): element is NumberField<string> {
  return element._type === "field" && element._field === "number";
}

export function isBooleanField(element: FormElement): element is BooleanField<string> {
  return element._type === "field" && element._field === "boolean";
}

export function isStaticEnumField(
  element: FormElement
): element is StaticEnumField<string, readonly EnumOptionValue[]> {
  return element._type === "field" && element._field === "enum";
}

export function isDynamicEnumField(
  element: FormElement
): element is DynamicEnumField<string, string> {
  return element._type === "field" && element._field === "dynamic_enum";
}

export function isDynamicSchemaField(
  element: FormElement
): element is DynamicSchemaField<string> {
  return element._type === "field" && element._field === "dynamic_schema";
}

export function isArrayField(
  element: FormElement
): element is ArrayField<string, readonly FormElement[]> {
  return element._type === "field" && element._field === "array";
}

export function isObjectField(
  element: FormElement
): element is ObjectField<string, readonly FormElement[]> {
  return element._type === "field" && element._field === "object";
}

export function isGroup(
  element: FormElement
): element is Group<readonly FormElement[]> {
  return element._type === "group";
}

export function isConditional(
  element: FormElement
): element is Conditional<string, unknown, readonly FormElement[]> {
  return element._type === "conditional";
}
