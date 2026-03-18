/**
 * Internal APIs for `@formspec/build`.
 *
 * This entry point exposes low-level analyzer and generator functions
 * used by `@formspec/cli`. These are NOT part of the public API and
 * may change without notice between versions.
 *
 * @remarks
 * Prefer the high-level functions from `@formspec/build` (e.g.,
 * `generateSchemasFromClass`, `buildFormSchemas`) for most use cases.
 *
 * @packageDocumentation
 */

// Analyzer: program context and class lookup
export { createProgramContext, findClassByName } from "./analyzer/program.js";

// Analyzer: class analysis
export { analyzeClass } from "./analyzer/class-analyzer.js";

// Generators: class schema
export { generateClassSchemas } from "./generators/class-schema.js";

// Generators: method schema
export { generateMethodSchemas, collectFormSpecReferences } from "./generators/method-schema.js";
export type { LoadedFormSpecSchemas, MethodSchemas } from "./generators/method-schema.js";
