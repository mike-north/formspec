/**
 * Branded integer type for FormSpec schema generation.
 *
 * Fields typed as `Integer` (or any type branded with `__integerBrand`)
 * produce `{ type: "integer" }` in JSON Schema and accept standard
 * numeric constraints (`@minimum`, `@maximum`, etc.) natively.
 */

/**
 * Brand symbol for FormSpec integer types.
 *
 * Downstream consumers can create compatible integer types by branding
 * with this symbol:
 *
 * @example
 * ```typescript
 * import { __integerBrand } from "@formspec/core";
 * type PositiveInteger = number & { readonly [__integerBrand]: true };
 * ```
 *
 * @public
 */
export const __integerBrand: unique symbol = Symbol("__integerBrand");

/**
 * Branded integer type. Values are `number` at runtime but carry
 * integer semantics for schema generation (`{ type: "integer" }`).
 *
 * @public
 */
export type Integer = number & { readonly [__integerBrand]: true };
