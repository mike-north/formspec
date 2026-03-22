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

// Canonicalize: DSL → FormIR
export { canonicalizeDSL } from "./canonicalize/index.js";

// Analyzer: program context and type lookup
export {
  createProgramContext,
  findClassByName,
  findInterfaceByName,
  findTypeAliasByName,
} from "./analyzer/program.js";

// Analyzer: class, interface, and type alias analysis
export { analyzeClass, analyzeInterface, analyzeTypeAlias } from "./analyzer/class-analyzer.js";
export type { AnalyzeTypeAliasResult } from "./analyzer/class-analyzer.js";

// Generators: class schema
export { generateClassSchemas } from "./generators/class-schema.js";

// UI Schema utilities
export { generateUiSchemaFromFields } from "./ui-schema/generator.js";

// Generators: method schema
export { generateMethodSchemas, collectFormSpecReferences } from "./generators/method-schema.js";
export type { LoadedFormSpecSchemas, MethodSchemas } from "./generators/method-schema.js";
