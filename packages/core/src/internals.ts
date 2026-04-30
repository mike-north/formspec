/**
 * Internal APIs for `@formspec/core`.
 *
 * This entry point exposes untrimmed core declarations for monorepo packages
 * that need low-level IR and extension authoring types.
 *
 * @packageDocumentation
 */

export * from "./types/index.js";
export * from "./extensions/index.js";
export * from "./guards.js";
export { UnreachableError } from "./errors.js";
export {
  _BUILTIN_CONSTRAINT_DEFINITIONS as BUILTIN_CONSTRAINT_DEFINITIONS,
  _isBuiltinConstraintName as isBuiltinConstraintName,
  _normalizeConstraintTagName as normalizeConstraintTagName,
} from "./types/constraint-definitions.js";
