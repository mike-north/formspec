/**
 * TC39 Stage 3 field decorators for defining FormSpec schemas.
 *
 * These decorators annotate class properties to configure form fields.
 * All fields are required by default; use @Optional() to allow empty values.
 *
 * Example:
 * ```typescript
 * @FormClass()
 * class MyForm {
 *   @Label("User Email")
 *   @Placeholder("user@example.com")
 *   email!: string;
 *
 *   @Label("Age")
 *   @Min(0)
 *   @Max(120)
 *   @Optional()
 *   age?: number;
 * }
 * ```
 */

import { setFieldMetadata } from "./metadata.js";

/**
 * Class decorator that marks a class as a FormSpec definition.
 *
 * This decorator is currently a marker - metadata finalization happens
 * lazily when metadata is first accessed via getClassMetadata().
 */
export function FormClass(): ClassDecoratorFunction {
  return (_target: Function, _context: ClassDecoratorContext) => {
    // Currently just a marker decorator
    // Metadata finalization happens lazily in getClassMetadata()
  };
}

/**
 * Sets the display label for a field.
 *
 * @param text - The label text to display
 */
export function Label(text: string): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    // Access the prototype through a dummy instance check
    // We'll use addInitializer which gives us access to instance 'this',
    // from which we can get the prototype
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        label: text,
      });
    });
  };
}

/**
 * Marks a field as optional (can be empty).
 *
 * By default, all fields are required. Use this decorator to allow empty values.
 */
export function Optional(): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        optional: true,
      });
    });
  };
}

/**
 * Sets placeholder text for a text field.
 *
 * @param text - The placeholder text to show when field is empty
 */
export function Placeholder(text: string): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        placeholder: text,
        fieldType: "text",
      });
    });
  };
}

/**
 * Sets the minimum value for a number field.
 *
 * @param value - The minimum allowed value
 */
export function Min(value: number): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        min: value,
        fieldType: "number",
      });
    });
  };
}

/**
 * Sets the maximum value for a number field.
 *
 * @param value - The maximum allowed value
 */
export function Max(value: number): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        max: value,
        fieldType: "number",
      });
    });
  };
}

/**
 * Defines static enum options for a field.
 *
 * Options can be plain strings or objects with `id` and `label` properties.
 *
 * @param options - Array of enum options (strings or {id, label} objects)
 */
export function EnumOptions<T extends readonly (string | { id: string; label: string })[]>(
  options: T
): FieldDecoratorFunction {
  return <C, V>(_target: undefined, context: ClassFieldDecoratorContext<C, V>) => {
    context.addInitializer(function (this: C) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        enumOptions: options,
        fieldType: "enum",
      });
    });
  };
}

/**
 * Assigns a field to a named group for visual organization.
 *
 * Fields with the same group name will be rendered together.
 *
 * @param name - The group name
 */
export function Group(name: string): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        group: name,
      });
    });
  };
}

/**
 * Makes a field conditionally visible based on another field's value.
 *
 * The field is only shown when the specified field equals the specified value.
 *
 * @param predicate - Equality predicate with field name and value
 */
export function ShowWhen<K extends string, V>(predicate: {
  _predicate: "equals";
  field: K;
  value: V;
}): FieldDecoratorFunction {
  return <T, Val>(_target: undefined, context: ClassFieldDecoratorContext<T, Val>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        showWhen: predicate,
      });
    });
  };
}

/**
 * Sets the minimum number of items for an array field.
 *
 * @param count - The minimum number of items required
 */
export function MinItems(count: number): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        minItems: count,
        fieldType: "array",
      });
    });
  };
}

/**
 * Sets the maximum number of items for an array field.
 *
 * @param count - The maximum number of items allowed
 */
export function MaxItems(count: number): FieldDecoratorFunction {
  return <T, V>(_target: undefined, context: ClassFieldDecoratorContext<T, V>) => {
    context.addInitializer(function (this: T) {
      const prototype = Object.getPrototypeOf(this) as Record<string | symbol, unknown>;
      setFieldMetadata(prototype, context.name, {
        maxItems: count,
        fieldType: "array",
      });
    });
  };
}

// =============================================================================
// TYPE HELPERS
// =============================================================================

/**
 * Type alias for class constructors used in metadata storage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClassConstructor = new (...args: any[]) => any;

/**
 * Type alias for field decorator functions.
 *
 * TC39 Stage 3 field decorators receive:
 * - target: undefined (not the prototype)
 * - context: ClassFieldDecoratorContext with name, metadata, etc.
 */
type FieldDecoratorFunction = <T, V>(
  target: undefined,
  context: ClassFieldDecoratorContext<T, V>
) => void;

/**
 * Type alias for class decorator functions.
 */
type ClassDecoratorFunction = (target: Function, context: ClassDecoratorContext) => void;
