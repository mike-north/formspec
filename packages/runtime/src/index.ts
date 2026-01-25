/**
 * `@formspec/runtime` - Runtime helpers for FormSpec
 *
 * This package provides utilities for working with FormSpec forms at runtime:
 * - `defineResolvers()` - Type-safe resolver definitions for dynamic enum fields
 *
 * @example
 * ```typescript
 * import { defineResolvers } from "@formspec/runtime";
 * import { formspec, field } from "@formspec/dsl";
 *
 * // Define a form with dynamic enum fields
 * const form = formspec(
 *   field.dynamicEnum("country", "countries", { label: "Country" }),
 * );
 *
 * // Define resolvers for the form's data sources
 * const resolvers = defineResolvers(form, {
 *   countries: async () => ({
 *     options: [
 *       { value: "us", label: "United States" },
 *       { value: "ca", label: "Canada" },
 *     ],
 *     validity: "valid",
 *   }),
 * });
 *
 * // Use the resolver
 * const result = await resolvers.get("countries")();
 * console.log(result.options); // [{ value: "us", ... }, { value: "ca", ... }]
 * ```
 *
 * @packageDocumentation
 */

export {
  defineResolvers,
  type Resolver,
  type ResolverMap,
  type ResolverRegistry,
} from "./resolvers.js";
