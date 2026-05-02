/**
 * Application/types-side responsibility area for @formspec/config.
 *
 * Concerns: what a resolved config means and how it is used. Defines the
 * `FormSpecConfig` type, `defineFormSpecConfig` helper, default values, and
 * DSL-policy interop types. Environment-agnostic and does not import from
 * Node's filesystem APIs.
 *
 * Consumers that already have a config object in hand only need exports from
 * this directory; they do not pay for the loader.
 *
 * Internal barrel for application-side exports.
 */
export { defineFormSpecConfig } from "./define.js";
export * from "./policy.js";
