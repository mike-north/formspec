/**
 * @formspec/decorators
 *
 * Marker-only TC39 Stage 3 decorators for FormSpec CLI static analysis.
 *
 * These decorators are **no-ops at runtime** — they exist solely as markers
 * that the FormSpec CLI reads through static AST analysis. They carry no
 * runtime behavior, store no metadata, and have zero overhead.
 *
 * The package also provides factory functions (`extendDecorator`,
 * `customDecorator`) that let consumers create their own decorator markers
 * for use with FormSpec CLI extensions.
 */

// =============================================================================
// Types
// =============================================================================

/** Options for the `@Field` decorator. */
export interface FieldOptions {
  displayName: string;
  description?: string;
  placeholder?: string;
  order?: number;
}

/** Condition for the `@ShowWhen` decorator. */
export interface ShowWhenCondition {
  field: string;
  value: unknown;
}

/** A single enum option value — either a plain string or a labeled object. */
export type EnumOptionValue = string | { id: string; label: string };

/** Input type for the `@EnumOptions` decorator. */
export type EnumOptionsInput = EnumOptionValue[] | Record<string, string>;

// =============================================================================
// Decorator type alias
// =============================================================================

/**
 * TC39 Stage 3 class field decorator signature.
 *
 * Receives `undefined` (field decorators don't have access to the initial
 * value) and a `ClassFieldDecoratorContext`. Returns `void` because these
 * are marker-only decorators.
 */
type ClassFieldDecorator = (value: undefined, context: ClassFieldDecoratorContext) => void;

// =============================================================================
// Registry interface
// =============================================================================

/**
 * Maps each built-in decorator name to the type of its argument.
 *
 * This interface is used by `extendDecorator` to constrain extension targets
 * and by the CLI to understand built-in decorator signatures.
 *
 * Consumers can augment this interface via declaration merging if they
 * register new built-in decorators (though `customDecorator` is the
 * preferred extensibility path).
 */
export interface FormSpecDecorators {
  Field: FieldOptions;
  Group: string;
  ShowWhen: ShowWhenCondition;
  EnumOptions: EnumOptionsInput;
  Minimum: number;
  Maximum: number;
  ExclusiveMinimum: number;
  ExclusiveMaximum: number;
  MinLength: number;
  MaxLength: number;
  Pattern: string;
}

// =============================================================================
// Brand symbols and interfaces
// =============================================================================

/** Brand symbol indicating which built-in decorator is being extended. */
export const FORMSPEC_EXTENDS: unique symbol = Symbol("formspec.extends");

/** Brand symbol indicating which CLI extension namespace a decorator belongs to. */
export const FORMSPEC_EXTENSION: unique symbol = Symbol("formspec.extension");

/** Brand symbol indicating a marker (zero-arg) decorator. */
export const FORMSPEC_MARKER: unique symbol = Symbol("formspec.marker");

/** Brand interface for decorators that extend a built-in. */
export interface FormSpecExtendsBrand<TExtends extends keyof FormSpecDecorators> {
  readonly [FORMSPEC_EXTENDS]: TExtends;
}

/** Brand interface for decorators belonging to a CLI extension. */
export interface FormSpecExtensionBrand<TExt extends string> {
  readonly [FORMSPEC_EXTENSION]: TExt;
}

/** Brand interface for marker (zero-arg) decorators. */
export interface FormSpecMarkerBrand {
  readonly [FORMSPEC_MARKER]: true;
}

// =============================================================================
// No-op decorator implementation
// =============================================================================

/**
 * Shared no-op decorator function. Every built-in and factory-produced
 * decorator ultimately delegates to this.
 */
function noop(_value: undefined, _context: ClassFieldDecoratorContext): void {
  // Intentionally empty — marker only.
}

// =============================================================================
// Built-in decorators
// =============================================================================

/**
 * Marks a class field with display metadata (label, description, placeholder, order).
 *
 * @example
 * ```typescript
 * class UserForm {
 *   @Field({ displayName: "Full Name", placeholder: "Jane Doe" })
 *   name!: string;
 * }
 * ```
 */
export function Field(_opts: FieldOptions): ClassFieldDecorator {
  return noop;
}

/**
 * Assigns a field to a named UI group / section.
 *
 * @example
 * ```typescript
 * class UserForm {
 *   @Group("Personal Info")
 *   @Field({ displayName: "Name" })
 *   name!: string;
 * }
 * ```
 */
export function Group(_name: string): ClassFieldDecorator {
  return noop;
}

/**
 * Makes a field conditionally visible based on another field's value.
 *
 * @example
 * ```typescript
 * class ContactForm {
 *   @ShowWhen({ field: "method", value: "email" })
 *   @Field({ displayName: "Email" })
 *   email!: string;
 * }
 * ```
 */
export function ShowWhen(_condition: ShowWhenCondition): ClassFieldDecorator {
  return noop;
}

/**
 * Provides custom options (with optional labels) for enum fields.
 *
 * @example
 * ```typescript
 * class SettingsForm {
 *   @EnumOptions([
 *     { id: "us", label: "United States" },
 *     { id: "ca", label: "Canada" },
 *   ])
 *   @Field({ displayName: "Country" })
 *   country!: "us" | "ca";
 * }
 * ```
 */
export function EnumOptions(_opts: EnumOptionsInput): ClassFieldDecorator {
  return noop;
}

/**
 * Sets the minimum allowed value for a numeric field (inclusive).
 *
 * Maps to JSON Schema `minimum`.
 */
export function Minimum(_n: number): ClassFieldDecorator {
  return noop;
}

/**
 * Sets the maximum allowed value for a numeric field (inclusive).
 *
 * Maps to JSON Schema `maximum`.
 */
export function Maximum(_n: number): ClassFieldDecorator {
  return noop;
}

/**
 * Sets the exclusive minimum for a numeric field.
 *
 * Maps to JSON Schema `exclusiveMinimum`.
 */
export function ExclusiveMinimum(_n: number): ClassFieldDecorator {
  return noop;
}

/**
 * Sets the exclusive maximum for a numeric field.
 *
 * Maps to JSON Schema `exclusiveMaximum`.
 */
export function ExclusiveMaximum(_n: number): ClassFieldDecorator {
  return noop;
}

/**
 * Sets the minimum character length for a string field.
 *
 * Maps to JSON Schema `minLength`.
 */
export function MinLength(_n: number): ClassFieldDecorator {
  return noop;
}

/**
 * Sets the maximum character length for a string field.
 *
 * Maps to JSON Schema `maxLength`.
 */
export function MaxLength(_n: number): ClassFieldDecorator {
  return noop;
}

/**
 * Sets a regex validation pattern for a string field.
 *
 * Maps to JSON Schema `pattern`, which is an ECMA-262 regular expression string.
 *
 * @example
 * ```typescript
 * @Pattern("^[a-z]+$")  // lowercase letters only
 * username!: string;
 * ```
 */
export function Pattern(_pattern: string): ClassFieldDecorator {
  return noop;
}

// =============================================================================
// Factory functions
// =============================================================================

/**
 * Creates a decorator that narrows / specialises a built-in FormSpec decorator.
 *
 * The returned object exposes an `.as(name)` method that produces a
 * parameterised decorator function branded with `FormSpecExtendsBrand`.
 *
 * @example
 * ```typescript
 * const CurrencyField = extendDecorator("Field").as<{
 *   displayName: string;
 *   currency: string;
 * }>("CurrencyField");
 *
 * class InvoiceForm {
 *   @CurrencyField({ displayName: "Amount", currency: "USD" })
 *   amount!: number;
 * }
 * ```
 */
export function extendDecorator<const TExtends extends keyof FormSpecDecorators>(
  _extendsName: TExtends
): {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TArgs is specified by callers at call sites
  as<TArgs>(name: string): ((_args: TArgs) => ClassFieldDecorator) & FormSpecExtendsBrand<TExtends>;
} {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TArgs is specified by callers at call sites
    as<TArgs>(
      _name: string
    ): ((_args: TArgs) => ClassFieldDecorator) & FormSpecExtendsBrand<TExtends> {
      const factory = (_args: TArgs): ClassFieldDecorator => noop;
      // Brand the factory at the type level. The runtime object doesn't need
      // the symbol properties — the CLI reads the brand from the type system.
      return factory as ((_args: TArgs) => ClassFieldDecorator) & FormSpecExtendsBrand<TExtends>;
    },
  };
}

/**
 * Creates custom decorator(s) that belong to a CLI extension namespace.
 *
 * - `.as(name)` — parameterised decorator (takes args, returns field decorator)
 * - `.marker(name)` — marker decorator (zero-arg, applied directly)
 *
 * @example
 * ```typescript
 * // Parameterised custom decorator
 * const Tooltip = customDecorator("my-ui-extension")
 *   .as<{ text: string }>("Tooltip");
 *
 * // Marker custom decorator
 * const Sensitive = customDecorator("my-ui-extension").marker("Sensitive");
 *
 * class ProfileForm {
 *   @Tooltip({ text: "This is shown on hover" })
 *   @Field({ displayName: "Bio" })
 *   bio!: string;
 *
 *   @Sensitive
 *   @Field({ displayName: "SSN" })
 *   ssn!: string;
 * }
 * ```
 */
export function customDecorator<const TExt extends string>(
  _extensionName: TExt
): {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TArgs is specified by callers at call sites
  as<TArgs>(name: string): ((_args: TArgs) => ClassFieldDecorator) & FormSpecExtensionBrand<TExt>;
  marker(name: string): ClassFieldDecorator & FormSpecMarkerBrand & FormSpecExtensionBrand<TExt>;
};

/**
 * Creates custom decorator(s) without a CLI extension namespace.
 *
 * @example
 * ```typescript
 * const Title = customDecorator().marker("Title");
 *
 * class MyForm {
 *   @Title
 *   @Field({ displayName: "Heading" })
 *   heading!: string;
 * }
 * ```
 */
export function customDecorator(): {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TArgs is specified by callers at call sites
  as<TArgs>(name: string): (_args: TArgs) => ClassFieldDecorator;
  marker(name: string): ClassFieldDecorator & FormSpecMarkerBrand;
};

// Implementation
export function customDecorator<const TExt extends string>(
  _extensionName?: TExt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TArgs is specified by callers at call sites
    as<TArgs>(
      _name: string
    ): ((_args: TArgs) => ClassFieldDecorator) & FormSpecExtensionBrand<TExt> {
      const factory = (_args: TArgs): ClassFieldDecorator => noop;
      return factory as ((_args: TArgs) => ClassFieldDecorator) & FormSpecExtensionBrand<TExt>;
    },
    marker(
      _name: string
    ): ClassFieldDecorator & FormSpecMarkerBrand & FormSpecExtensionBrand<TExt> {
      return noop as ClassFieldDecorator & FormSpecMarkerBrand & FormSpecExtensionBrand<TExt>;
    },
  };
}
