/**
 * @formspec/decorators
 *
 * Decorator stubs for FormSpec CLI static analysis.
 *
 * These decorators are no-ops at runtime. The FormSpec CLI reads them
 * through static analysis of your TypeScript source code, extracting
 * metadata to generate JSON Schema and UX specifications.
 *
 * @example
 * ```typescript
 * import { Label, Min, Max, EnumOptions } from '@formspec/decorators';
 *
 * class UserForm {
 *   @Label("Full Name")
 *   name!: string;
 *
 *   @Label("Age")
 *   @Min(18)
 *   @Max(120)
 *   age?: number;
 *
 *   @Label("Country")
 *   @EnumOptions([
 *     { id: "us", label: "United States" },
 *     { id: "ca", label: "Canada" }
 *   ])
 *   country!: "us" | "ca";
 * }
 * ```
 */

// Type for property decorator
type PropertyDecorator = (target: object, propertyKey: string) => void;

// Type for enum option - can be a simple string or an object with id/label
export type EnumOptionValue = string | { id: string; label: string };

// Type for conditional visibility condition
export interface ShowWhenCondition {
  field: string;
  value: unknown;
}

// =============================================================================
// Field Metadata Decorators
// =============================================================================

/**
 * Sets the display label for a field.
 *
 * @param text - The label text to display
 * @example
 * ```typescript
 * @Label("Email Address")
 * email!: string;
 * ```
 */
export function Label(_text: string): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets placeholder text for input fields.
 *
 * @param text - The placeholder text
 * @example
 * ```typescript
 * @Placeholder("Enter your email...")
 * email!: string;
 * ```
 */
export function Placeholder(_text: string): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets a description or help text for a field.
 *
 * @param text - The description text
 * @example
 * ```typescript
 * @Description("We'll never share your email with anyone")
 * email!: string;
 * ```
 */
export function Description(_text: string): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

// =============================================================================
// Numeric Constraint Decorators
// =============================================================================

/**
 * Sets the minimum allowed value for a numeric field.
 *
 * @param value - The minimum value
 * @example
 * ```typescript
 * @Min(0)
 * quantity!: number;
 * ```
 */
export function Min(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets the maximum allowed value for a numeric field.
 *
 * @param value - The maximum value
 * @example
 * ```typescript
 * @Max(100)
 * percentage!: number;
 * ```
 */
export function Max(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets the step increment for a numeric field.
 *
 * @param value - The step value
 * @example
 * ```typescript
 * @Step(0.01)
 * price!: number;
 * ```
 */
export function Step(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

// =============================================================================
// String Constraint Decorators
// =============================================================================

/**
 * Sets the minimum length for a string field.
 *
 * @param value - The minimum character count
 * @example
 * ```typescript
 * @MinLength(1)
 * name!: string;
 * ```
 */
export function MinLength(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets the maximum length for a string field.
 *
 * @param value - The maximum character count
 * @example
 * ```typescript
 * @MaxLength(255)
 * bio!: string;
 * ```
 */
export function MaxLength(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets a regex pattern for string validation.
 *
 * @param regex - The regex pattern as a string
 * @example
 * ```typescript
 * @Pattern("^[a-z]+$")
 * username!: string;
 * ```
 */
export function Pattern(_regex: string): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

// =============================================================================
// Array Constraint Decorators
// =============================================================================

/**
 * Sets the minimum number of items for an array field.
 *
 * @param value - The minimum item count
 * @example
 * ```typescript
 * @MinItems(1)
 * tags!: string[];
 * ```
 */
export function MinItems(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Sets the maximum number of items for an array field.
 *
 * @param value - The maximum item count
 * @example
 * ```typescript
 * @MaxItems(10)
 * tags!: string[];
 * ```
 */
export function MaxItems(_value: number): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

// =============================================================================
// Enum and Options Decorators
// =============================================================================

/**
 * Provides custom options for enum fields with labels.
 *
 * Use this to provide human-readable labels for enum values,
 * or to customize the order and display of options.
 *
 * @param options - Array of option values or {id, label} objects
 * @example
 * ```typescript
 * @EnumOptions([
 *   { id: "us", label: "United States" },
 *   { id: "ca", label: "Canada" },
 *   { id: "uk", label: "United Kingdom" }
 * ])
 * country!: "us" | "ca" | "uk";
 * ```
 */
export function EnumOptions(_options: EnumOptionValue[]): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

// =============================================================================
// Conditional and Layout Decorators
// =============================================================================

/**
 * Makes a field conditionally visible based on another field's value.
 *
 * @param condition - Object specifying the field and value to match
 * @example
 * ```typescript
 * @ShowWhen({ field: "contactMethod", value: "email" })
 * emailAddress!: string;
 *
 * @ShowWhen({ field: "contactMethod", value: "phone" })
 * phoneNumber!: string;
 * ```
 */
export function ShowWhen(_condition: ShowWhenCondition): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}

/**
 * Groups fields together under a named section.
 *
 * @param name - The group name
 * @example
 * ```typescript
 * @Group("Personal Information")
 * @Label("First Name")
 * firstName!: string;
 *
 * @Group("Personal Information")
 * @Label("Last Name")
 * lastName!: string;
 *
 * @Group("Contact Details")
 * @Label("Email")
 * email!: string;
 * ```
 */
export function Group(_name: string): PropertyDecorator {
  return function (_target: object, _propertyKey: string): void {};
}
