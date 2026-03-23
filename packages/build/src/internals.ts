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
export { canonicalizeChainDSL } from "./canonicalize/index.js";

// Canonicalization: TSDoc → FormIR
export { canonicalizeTSDoc } from "./canonicalize/index.js";
export type { TSDocSource } from "./canonicalize/index.js";

// Analyzer: program context and type lookup
export {
  createProgramContext,
  findClassByName,
  findInterfaceByName,
  findTypeAliasByName,
} from "./analyzer/program.js";

// Analyzer: IR analysis (class, interface, type alias)
export {
  analyzeClassToIR,
  analyzeInterfaceToIR,
  analyzeTypeAliasToIR,
} from "./analyzer/class-analyzer.js";
export type {
  IRClassAnalysis,
  FieldLayoutMetadata,
  AnalyzeTypeAliasToIRResult,
} from "./analyzer/class-analyzer.js";

// Generators: class schema (now routes through IR)
export { generateClassSchemas } from "./generators/class-schema.js";

// JSON Schema 2020-12: IR-based generator
export { generateJsonSchemaFromIR } from "./json-schema/ir-generator.js";
export type { JsonSchema2020 } from "./json-schema/ir-generator.js";

// UI Schema: IR-based generator
export { generateUiSchemaFromIR } from "./ui-schema/ir-generator.js";

// Validate: constraint validation and contradiction detection
export { validateIR } from "./validate/index.js";
export type {
  ValidationDiagnostic,
  ValidationResult,
  ValidateIROptions,
} from "./validate/index.js";

// Extensions: extension registry for custom types, constraints, annotations
export { createExtensionRegistry } from "./extensions/index.js";
export type { ExtensionRegistry } from "./extensions/index.js";

// Generators: method schema
export { generateMethodSchemas, collectFormSpecReferences } from "./generators/method-schema.js";
export type { LoadedFormSpecSchemas, MethodSchemas } from "./generators/method-schema.js";
