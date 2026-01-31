/**
 * `@formspec/exp-decorators` - Decorator-based FormSpec DSL
 *
 * This experiment provides a decorator-based alternative to the FormSpec DSL
 * that allows defining forms by annotating TypeScript class properties.
 *
 * Uses TC39 Stage 3 decorators (TypeScript 5.0+).
 *
 * @example
 * ```typescript
 * import { FormClass, Label, Optional, Min, Max, toFormSpec } from '@formspec/exp-decorators';
 *
 * @FormClass()
 * class UserForm {
 *   @Label("Full Name")
 *   name!: string;
 *
 *   @Label("Age")
 *   @Min(0)
 *   @Max(120)
 *   @Optional()
 *   age?: number;
 *
 *   @Label("Email")
 *   email!: string;
 * }
 *
 * const spec = toFormSpec(UserForm);
 * ```
 *
 * @packageDocumentation
 */

// Re-export decorators
export {
  FormClass,
  Label,
  Optional,
  Boolean,
  Placeholder,
  Min,
  Max,
  EnumOptions,
  Group,
  ShowWhen,
  MinItems,
  MaxItems,
} from "./decorators.js";

// Re-export type utilities
export type { InferClassSchema } from "./inference.js";

// Re-export conversion function
export { toFormSpec } from "./to-formspec.js";

// Re-export metadata utilities (for advanced use cases)
export { getFieldMetadata, getClassMetadata } from "./metadata.js";
export type { FieldMetadata } from "./metadata.js";
