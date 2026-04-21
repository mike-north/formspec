/**
 * Class schema generator.
 *
 * Generates JSON Schema 2020-12 and JSON Forms UI Schema from statically
 * analyzed class/interface/type alias declarations, routing through the
 * canonical FormIR pipeline.
 */

import * as ts from "typescript";
import type { UISchema } from "../ui-schema/types.js";
import type { MetadataPolicyInput } from "@formspec/core";
import type { FormSpecConfig } from "@formspec/config";
import {
  analyzeNamedTypeToIRFromProgramContextDetailed,
  createProgramContext,
  createProgramContextFromProgram,
  findClassByName,
  type AnalyzeNamedTypeToIRDetailedResult,
  type ProgramContext,
} from "../analyzer/program.js";
import {
  analyzeClassToIR,
  type DiscriminatorResolutionOptions,
  type IRClassAnalysis,
} from "../analyzer/class-analyzer.js";
import { canonicalizeTSDoc, type TSDocSource } from "../canonicalize/index.js";
import {
  generateJsonSchemaFromIR,
  type GenerateJsonSchemaFromIROptions,
  type JsonSchema2020,
} from "../json-schema/ir-generator.js";
import {
  createExtensionRegistry,
  type ExtensionRegistry,
  type MutableExtensionRegistry,
} from "../extensions/index.js";
import { buildSymbolMapFromConfig } from "../extensions/symbol-registry.js";
import { generateUiSchemaFromIR } from "../ui-schema/ir-generator.js";
import { validateIR, type ValidationDiagnostic } from "../validate/index.js";

export type { DiscriminatorResolutionOptions } from "../analyzer/class-analyzer.js";

/**
 * Generated schemas for a class.
 *
 * @beta
 */
export interface ClassSchemas {
  /** JSON Schema 2020-12 for validation */
  jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering */
  uiSchema: UISchema;
}

/**
 * Non-throwing schema generation result with structured diagnostics.
 *
 * @public
 */
export interface DetailedClassSchemasResult {
  /** Whether schema generation completed without error-severity diagnostics. */
  readonly ok: boolean;
  /** Collected analysis and validation diagnostics for this target. */
  readonly diagnostics: readonly ValidationDiagnostic[];
  /** JSON Schema 2020-12 for validation, when generation succeeds. */
  readonly jsonSchema?: JsonSchema2020 | undefined;
  /** JSON Forms UI Schema for rendering, when generation succeeds. */
  readonly uiSchema?: UISchema | undefined;
}

/**
 * A batch target for non-throwing schema generation.
 *
 * @public
 */
export interface SchemaGenerationTarget {
  /** Path to the TypeScript source file. */
  readonly filePath: string;
  /** Name of the exported class, interface, or type alias to analyze. */
  readonly typeName: string;
}

/**
 * Batch options for non-throwing schema generation.
 *
 * @public
 */
export interface GenerateSchemasBatchOptions extends StaticSchemaGenerationOptions {
  /** Targets to analyze and generate. */
  readonly targets: readonly SchemaGenerationTarget[];
}

/**
 * Batch options for non-throwing schema generation using an existing program.
 *
 * @public
 */
export interface GenerateSchemasBatchFromProgramOptions extends StaticSchemaGenerationOptions {
  /** Existing TypeScript program supplied by the caller. */
  readonly program: ts.Program;
  /** Targets to analyze and generate. */
  readonly targets: readonly SchemaGenerationTarget[];
}

/**
 * Result for a single target in a batch generation request.
 *
 * @public
 */
export interface DetailedSchemaGenerationTargetResult extends DetailedClassSchemasResult {
  /** Path to the TypeScript source file. */
  readonly filePath: string;
  /** Name of the exported class, interface, or type alias that was analyzed. */
  readonly typeName: string;
}

/**
 * Generates JSON Schema 2020-12 and UI Schema from an IR class analysis.
 *
 * Routes through the canonical IR pipeline:
 *   IRClassAnalysis → canonicalizeTSDoc → FormIR → JSON Schema / UI Schema
 *
 * @param analysis - The IR analysis result (from analyzeClassToIR, analyzeInterfaceToIR, or analyzeTypeAliasToIR)
 * @param source - Optional source file metadata for provenance
 * @returns Generated JSON Schema and UI Schema
 */
export function generateClassSchemas(
  analysis: IRClassAnalysis,
  source?: TSDocSource,
  options?: GenerateJsonSchemaFromIROptions & { metadata?: MetadataPolicyInput | undefined }
): ClassSchemas {
  const result = generateClassSchemasDetailed(analysis, source, options);
  if (!result.ok || result.jsonSchema === undefined || result.uiSchema === undefined) {
    throw new Error(formatValidationError(result.diagnostics));
  }

  return {
    jsonSchema: result.jsonSchema,
    uiSchema: result.uiSchema,
  };
}

/**
 * Generates JSON Schema 2020-12 and UI Schema from an IR class analysis
 * without throwing on validation diagnostics.
 *
 * @public
 */
export function generateClassSchemasDetailed(
  analysis: IRClassAnalysis,
  source?: TSDocSource,
  options?: GenerateJsonSchemaFromIROptions & { metadata?: MetadataPolicyInput | undefined }
): DetailedClassSchemasResult {
  const analysisDiagnostics = analysis.diagnostics ?? [];
  const errorDiagnostics = analysisDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (errorDiagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: analysisDiagnostics,
    };
  }

  const ir = canonicalizeTSDoc(
    analysis,
    source,
    options?.metadata !== undefined ? { metadata: options.metadata } : undefined
  );
  const validationResult = validateIR(ir, {
    ...(options?.extensionRegistry !== undefined && {
      extensionRegistry: options.extensionRegistry,
    }),
    ...(options?.vendorPrefix !== undefined && { vendorPrefix: options.vendorPrefix }),
  });
  if (!validationResult.valid) {
    return {
      ok: false,
      diagnostics: [...analysisDiagnostics, ...validationResult.diagnostics],
    };
  }

  return {
    ok: true,
    diagnostics: [...analysisDiagnostics, ...validationResult.diagnostics],
    jsonSchema: generateJsonSchemaFromIR(ir, options),
    uiSchema: generateUiSchemaFromIR(ir),
  };
}

function formatValidationError(diagnostics: readonly ValidationDiagnostic[]): string {
  const lines = diagnostics.map((diagnostic) => {
    const primary = formatLocation(diagnostic.primaryLocation);
    const related =
      diagnostic.relatedLocations.length > 0
        ? ` [related: ${diagnostic.relatedLocations.map(formatLocation).join(", ")}]`
        : "";
    return `${diagnostic.code}: ${diagnostic.message} (${primary})${related}`;
  });

  return `FormSpec validation failed:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function formatLocation(location: ValidationDiagnostic["primaryLocation"]): string {
  return `${location.file}:${String(location.line)}:${String(location.column)}`;
}

/**
 * Shared options for schema generation flows that support custom extensions.
 *
 * @public
 */
export interface StaticSchemaGenerationOptions {
  /**
   * FormSpec project configuration. When provided, resolves `extensionRegistry`,
   * `vendorPrefix`, `enumSerialization`, and `metadata` from the config object.
   * Direct options take precedence over config values.
   */
  readonly config?: FormSpecConfig | undefined;
  /**
   * Registry used to resolve custom types, constraints, and annotations.
   * @deprecated Provide a `FormSpecConfig` via the `config` option instead.
   */
  readonly extensionRegistry?: ExtensionRegistry | undefined;
  /**
   * Vendor prefix for emitted extension keywords.
   * @defaultValue "x-formspec"
   * @deprecated Provide a `FormSpecConfig` via the `config` option instead.
   */
  readonly vendorPrefix?: string | undefined;
  /**
   * JSON Schema representation to use for static enums.
   * @defaultValue "enum"
   * @deprecated Provide a `FormSpecConfig` via the `config` option instead.
   */
  readonly enumSerialization?: "enum" | "oneOf" | "smart-size";
  /**
   * Metadata resolution policy for static schema generation.
   * @deprecated Provide a `FormSpecConfig` via the `config` option instead.
   */
  readonly metadata?: MetadataPolicyInput | undefined;
  /** Discriminator-specific schema generation behavior. */
  readonly discriminator?: DiscriminatorResolutionOptions | undefined;
  /**
   * Absolute path to the FormSpec config file (e.g., `formspec.config.ts`).
   *
   * When provided alongside a `config` that includes extensions, the build
   * pipeline includes the config file in the TypeScript program and extracts
   * `defineCustomType<T>()` type parameters. This enables symbol-based custom
   * type detection — the most precise resolution path, immune to import aliases
   * and name collisions.
   *
   * Obtain this from `loadFormSpecConfig()`:
   * ```typescript
   * const { config, configPath } = await loadFormSpecConfig();
   * await generateSchemas({ filePath, typeName, config, configPath, errorReporting: "throw" });
   * ```
   */
  readonly configPath?: string | undefined;
}

/**
 * Options for generating schemas from a decorated class.
 *
 * @public
 */
export interface GenerateFromClassOptions extends StaticSchemaGenerationOptions {
  /** Path to the TypeScript source file */
  filePath: string;
  /** Class name to analyze */
  className: string;
}

/**
 * Result of generating schemas from a decorated class.
 *
 * @public
 */
export interface GenerateFromClassResult {
  /** JSON Schema 2020-12 for validation */
  jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering */
  uiSchema: UISchema;
}

/**
 * Options for generating schemas from a named type inside an existing TypeScript program.
 *
 * @public
 */
export interface GenerateSchemasFromProgramOptions extends StaticSchemaGenerationOptions {
  /** Existing TypeScript program supplied by the caller. */
  readonly program: ts.Program;
  /** Path to the TypeScript source file */
  readonly filePath: string;
  /** Name of the exported class, interface, or type alias to analyze */
  readonly typeName: string;
  /**
   * Controls whether error-severity diagnostics throw or are returned in the result.
   */
  readonly errorReporting: "throw" | "diagnostics";
}

/**
 * Generates JSON Schema and UI Schema from a decorated TypeScript class.
 *
 * This is a high-level entry point that handles the entire pipeline:
 * creating a TypeScript program, finding the class, analyzing it to IR,
 * and generating schemas — all in one call.
 *
 * @example
 * ```typescript
 * const result = generateSchemasFromClass({
 *   filePath: "./src/forms.ts",
 *   className: "UserForm",
 * });
 * console.log(result.jsonSchema);
 * ```
 *
 * @param options - File path, class name, and optional compiler options
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
export function generateSchemasFromClass(
  options: GenerateFromClassOptions
): GenerateFromClassResult {
  const additionalFiles = options.configPath !== undefined ? [options.configPath] : undefined;
  const ctx = createProgramContext(options.filePath, additionalFiles);
  const classDecl = findClassByName(ctx.sourceFile, options.className);

  if (!classDecl) {
    throw new Error(`Class "${options.className}" not found in ${options.filePath}`);
  }

  const analysis = analyzeClassToIR(
    classDecl,
    ctx.checker,
    options.filePath,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    options.extensionRegistry,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    options.metadata,
    options.discriminator
  );
  return generateClassSchemas(
    analysis,
    { file: options.filePath },
    {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      extensionRegistry: options.extensionRegistry,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      metadata: options.metadata,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      enumSerialization: options.enumSerialization,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
      vendorPrefix: options.vendorPrefix,
    }
  );
}

/**
 * Options for generating schemas from a named type (class, interface, or type alias).
 *
 * @public
 */
export interface GenerateSchemasOptions extends StaticSchemaGenerationOptions {
  /** Path to the TypeScript source file */
  readonly filePath: string;
  /** Name of the exported class, interface, or type alias to analyze */
  readonly typeName: string;
  /**
   * Controls whether error-severity diagnostics throw or are returned in the result.
   */
  readonly errorReporting: "throw" | "diagnostics";
}

type GenerateSchemasImplementationOptions = StaticSchemaGenerationOptions & {
  readonly filePath: string;
  readonly typeName: string;
  readonly errorReporting?: "throw" | "diagnostics" | undefined;
};

type GenerateSchemasFromProgramImplementationOptions = StaticSchemaGenerationOptions & {
  readonly program: ts.Program;
  readonly filePath: string;
  readonly typeName: string;
  readonly errorReporting?: "throw" | "diagnostics" | undefined;
};

/**
 * Generates JSON Schema and UI Schema from a named TypeScript
 * type — a decorated class, an interface with TSDoc tags, or a type alias.
 *
 * This is the recommended entry point. It automatically detects whether
 * the name resolves to a class, interface, or type alias and uses the
 * appropriate IR analysis pipeline.
 *
 * @example
 * ```typescript
 * const result = generateSchemas({
 *   filePath: "./src/config.ts",
 *   typeName: "DiscountConfig",
 *   errorReporting: "throw",
 * });
 * ```
 */
/**
 * Generates JSON Schema and UI Schema from a named type and throws when
 * generation reports error-severity diagnostics.
 *
 * @param options - File path, type name, and explicit throw-on-error reporting
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
export function generateSchemas(
  options: GenerateSchemasOptions & { readonly errorReporting: "throw" }
): GenerateFromClassResult;
/**
 * Generates JSON Schema and UI Schema from a named type and returns structured
 * diagnostics instead of throwing on validation or analysis failures.
 *
 * @param options - File path, type name, and explicit diagnostics reporting
 * @returns Structured generation result with diagnostics
 *
 * @public
 */
export function generateSchemas(
  options: GenerateSchemasOptions & { readonly errorReporting: "diagnostics" }
): DetailedClassSchemasResult;
/**
 * Generates JSON Schema and UI Schema from a named type.
 *
 * @deprecated Pass `errorReporting` explicitly. Omitting it defaults to `"throw"` only for backward compatibility.
 * @param options - File path and type name
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
/* eslint-disable @typescript-eslint/unified-signatures */
export function generateSchemas(
  options: StaticSchemaGenerationOptions & {
    readonly filePath: string;
    readonly typeName: string;
  }
): GenerateFromClassResult;
/* eslint-enable @typescript-eslint/unified-signatures */
export function generateSchemas(
  options: GenerateSchemasImplementationOptions
): GenerateFromClassResult | DetailedClassSchemasResult {
  const result = generateSchemasDetailedInternal(options);
  if (options.errorReporting === "diagnostics") {
    return result;
  }
  if (!result.ok || result.jsonSchema === undefined || result.uiSchema === undefined) {
    throw new Error(formatValidationError(result.diagnostics));
  }

  return {
    jsonSchema: result.jsonSchema,
    uiSchema: result.uiSchema,
  };
}

/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program supplied by the caller.
 *
 * This low-level entry point lets downstream tooling reuse a host-owned
 * `Program` for both FormSpec extraction and other TypeScript analysis.
 */
/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program and throws when generation reports error-severity diagnostics.
 *
 * @param options - Host program, file path, type name, and explicit throw-on-error reporting
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
export function generateSchemasFromProgram(
  options: GenerateSchemasFromProgramOptions & { readonly errorReporting: "throw" }
): GenerateFromClassResult;
/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program and returns structured diagnostics instead of throwing on
 * validation or analysis failures.
 *
 * @param options - Host program, file path, type name, and explicit diagnostics reporting
 * @returns Structured generation result with diagnostics
 *
 * @public
 */
export function generateSchemasFromProgram(
  options: GenerateSchemasFromProgramOptions & { readonly errorReporting: "diagnostics" }
): DetailedClassSchemasResult;
/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program.
 *
 * @deprecated Pass `errorReporting` explicitly. Omitting it defaults to `"throw"` only for backward compatibility.
 * @param options - Host program, file path, and type name
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
/* eslint-disable @typescript-eslint/unified-signatures */
export function generateSchemasFromProgram(
  options: StaticSchemaGenerationOptions & {
    readonly program: ts.Program;
    readonly filePath: string;
    readonly typeName: string;
  }
): GenerateFromClassResult;
/* eslint-enable @typescript-eslint/unified-signatures */
export function generateSchemasFromProgram(
  options: GenerateSchemasFromProgramImplementationOptions
): GenerateFromClassResult | DetailedClassSchemasResult {
  const result = generateSchemasFromProgramDetailedInternal(options);
  if (options.errorReporting === "diagnostics") {
    return result;
  }
  if (!result.ok || result.jsonSchema === undefined || result.uiSchema === undefined) {
    throw new Error(formatValidationError(result.diagnostics));
  }

  return {
    jsonSchema: result.jsonSchema,
    uiSchema: result.uiSchema,
  };
}

/**
 * Generates JSON Schema and UI Schema from a named type and returns structured
 * diagnostics instead of throwing on validation or analysis failures.
 * @deprecated Use `generateSchemas({ ...options, errorReporting: "diagnostics" })` instead.
 *
 * @public
 */
export function generateSchemasDetailed(
  options: StaticSchemaGenerationOptions & {
    readonly filePath: string;
    readonly typeName: string;
  }
): DetailedClassSchemasResult {
  return generateSchemas({
    ...options,
    errorReporting: "diagnostics",
  });
}

function generateSchemasDetailedInternal(
  options: GenerateSchemasImplementationOptions
): DetailedClassSchemasResult {
  let ctx: ProgramContext;
  try {
    // Include the config file in the program when provided so that the config
    // AST is available for symbol-based type-parameter extraction.
    const additionalFiles = options.configPath !== undefined ? [options.configPath] : undefined;
    ctx = createProgramContext(options.filePath, additionalFiles);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [createProgramContextFailureDiagnostic(options.filePath, error)],
    };
  }

  return generateSchemasFromDetailedProgramContext(
    ctx,
    options.filePath,
    options.typeName,
    options
  );
}

/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program and returns structured diagnostics instead of throwing on
 * validation or analysis failures.
 * @deprecated Use `generateSchemasFromProgram({ ...options, errorReporting: "diagnostics" })` instead.
 *
 * @public
 */
export function generateSchemasFromProgramDetailed(
  options: StaticSchemaGenerationOptions & {
    readonly program: ts.Program;
    readonly filePath: string;
    readonly typeName: string;
  }
): DetailedClassSchemasResult {
  return generateSchemasFromProgram({
    ...options,
    errorReporting: "diagnostics",
  });
}

function generateSchemasFromProgramDetailedInternal(
  options: GenerateSchemasFromProgramImplementationOptions
): DetailedClassSchemasResult {
  let ctx: ProgramContext;
  try {
    ctx = createProgramContextFromProgram(options.program, options.filePath);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [createProgramContextFailureDiagnostic(options.filePath, error)],
    };
  }

  return generateSchemasFromDetailedProgramContext(
    ctx,
    options.filePath,
    options.typeName,
    options
  );
}

/**
 * Generates schemas for many targets and returns per-target diagnostics instead
 * of failing on the first problem.
 *
 * @public
 */
export function generateSchemasBatch(
  options: GenerateSchemasBatchOptions
): readonly DetailedSchemaGenerationTargetResult[] {
  const contextCache = new Map<string, ProgramContext>();

  // Resolve options once. The symbol map is rebuilt whenever a new ts.Program is
  // encountered — ts.Symbol identity is program-specific, so a map built from one
  // program must not be used to look up symbols from a different program.
  const resolved = resolveOptions(options);
  let symbolMapProgram: ts.Program | undefined;

  return options.targets.map((target) => {
    let ctx: ProgramContext;
    try {
      const cacheKey = ts.sys.useCaseSensitiveFileNames
        ? target.filePath
        : target.filePath.toLowerCase();
      const cachedContext = contextCache.get(cacheKey);
      if (cachedContext === undefined) {
        const additionalFiles = options.configPath !== undefined ? [options.configPath] : undefined;
        ctx = createProgramContext(target.filePath, additionalFiles);
        contextCache.set(cacheKey, ctx);
      } else {
        ctx = cachedContext;
      }
    } catch (error) {
      return withTarget(target, {
        ok: false,
        diagnostics: [createProgramContextFailureDiagnostic(target.filePath, error)],
      });
    }

    // Rebuild the symbol map whenever the program changes. ts.Symbol identity is
    // program-specific — a map seeded from one program cannot match symbols from
    // a different program, so we must re-walk the config AST for each new program.
    if (
      options.configPath !== undefined &&
      resolved.extensionRegistry !== undefined &&
      isMutableRegistry(resolved.extensionRegistry) &&
      ctx.program !== symbolMapProgram
    ) {
      const symbolMap = buildSymbolMapFromConfig(
        options.configPath,
        ctx.program,
        ctx.checker,
        resolved.extensionRegistry
      );
      resolved.extensionRegistry.setSymbolMap(symbolMap);
      symbolMapProgram = ctx.program;
    }

    return withTarget(
      target,
      generateSchemasFromResolvedOptions(
        ctx,
        target.filePath,
        target.typeName,
        resolved,
        options.discriminator
      )
    );
  });
}

/**
 * Generates schemas for many targets from an existing TypeScript program and
 * returns per-target diagnostics instead of failing on the first problem.
 *
 * @public
 */
export function generateSchemasBatchFromProgram(
  options: GenerateSchemasBatchFromProgramOptions
): readonly DetailedSchemaGenerationTargetResult[] {
  return options.targets.map((target) => {
    let ctx: ProgramContext;
    try {
      ctx = createProgramContextFromProgram(options.program, target.filePath);
    } catch (error) {
      return withTarget(target, {
        ok: false,
        diagnostics: [createProgramContextFailureDiagnostic(target.filePath, error)],
      });
    }

    return withTarget(
      target,
      generateSchemasFromDetailedProgramContext(ctx, target.filePath, target.typeName, options)
    );
  });
}

function isMutableRegistry(reg: ExtensionRegistry): reg is MutableExtensionRegistry {
  return (
    "setSymbolMap" in reg && typeof (reg as MutableExtensionRegistry).setSymbolMap === "function"
  );
}

/**
 * Resolves the effective extension registry, vendor prefix, enum serialization,
 * and metadata from a `StaticSchemaGenerationOptions` object.
 *
 * Prefers explicit deprecated fields when present, falling back to the
 * `config` object. This is the migration bridge — once all callers use
 * `config`, the deprecated field reads can be removed.
 *
 * @internal
 */
export function resolveStaticOptions(options: StaticSchemaGenerationOptions): {
  extensionRegistry: ExtensionRegistry | undefined;
  vendorPrefix: string | undefined;
  enumSerialization: "enum" | "oneOf" | "smart-size" | undefined;
  metadata: MetadataPolicyInput | undefined;
} {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
  const legacyRegistry = options.extensionRegistry;

  // Only construct the config registry if the deprecated field is absent and
  // extensions were actually configured. Treating an empty array as "no
  // registry" avoids building an empty registry (and emitting its debug log)
  // when callers pass a defaults-filled `ResolvedFormSpecConfig` that sets
  // `extensions: []` on behalf of users who never configured any.
  const configRegistry =
    legacyRegistry === undefined &&
    options.config?.extensions !== undefined &&
    options.config.extensions.length > 0
      ? createExtensionRegistry(options.config.extensions)
      : undefined;

  return {
    extensionRegistry: legacyRegistry ?? configRegistry,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    vendorPrefix: options.vendorPrefix ?? options.config?.vendorPrefix,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    enumSerialization: options.enumSerialization ?? options.config?.enumSerialization,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    metadata: options.metadata ?? options.config?.metadata,
  };
}

function resolveOptions(options: StaticSchemaGenerationOptions): {
  extensionRegistry: MutableExtensionRegistry | undefined;
  vendorPrefix: string | undefined;
  enumSerialization: "enum" | "oneOf" | "smart-size" | undefined;
  metadata: MetadataPolicyInput | undefined;
} {
  // Treat `extensions: []` as "no registry" — see `resolveStaticOptions`
  // above for the motivation (avoids building an empty registry when the
  // caller passes a defaults-filled `ResolvedFormSpecConfig`).
  const configRegistry =
    options.config?.extensions !== undefined && options.config.extensions.length > 0
      ? createExtensionRegistry(options.config.extensions)
      : undefined;

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
  const legacyRegistry = options.extensionRegistry;

  return {
    // When the caller provides the deprecated extensionRegistry field directly,
    // it is typed as the read-only ExtensionRegistry interface. We cast here
    // because the legacy path was introduced before MutableExtensionRegistry was
    // split out; callers using createExtensionRegistry() always get a mutable
    // registry, and this cast is safe for all registries produced by this module.
    extensionRegistry: (legacyRegistry as MutableExtensionRegistry | undefined) ?? configRegistry,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    vendorPrefix: options.vendorPrefix ?? options.config?.vendorPrefix,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    enumSerialization: options.enumSerialization ?? options.config?.enumSerialization,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- migration bridge reads deprecated fields
    metadata: options.metadata ?? options.config?.metadata,
  };
}

function generateSchemasFromDetailedProgramContext(
  ctx: ProgramContext,
  filePath: string,
  typeName: string,
  options: StaticSchemaGenerationOptions
): DetailedClassSchemasResult {
  const resolved = resolveOptions(options);

  // If a configPath and extension registry are both available, build the
  // symbol map from the config AST and register it on the registry. This
  // enables the symbol-based detection path in the type resolver.
  if (
    options.configPath !== undefined &&
    resolved.extensionRegistry !== undefined &&
    isMutableRegistry(resolved.extensionRegistry)
  ) {
    const symbolMap = buildSymbolMapFromConfig(
      options.configPath,
      ctx.program,
      ctx.checker,
      resolved.extensionRegistry
    );
    resolved.extensionRegistry.setSymbolMap(symbolMap);
  }

  return generateSchemasFromResolvedOptions(
    ctx,
    filePath,
    typeName,
    resolved,
    options.discriminator
  );
}

/**
 * Inner implementation: generates schemas from a ProgramContext and pre-resolved options.
 *
 * Separated so that batch callers can resolve options and seed the symbol map once
 * outside the per-target loop, then call this directly without repeating that work.
 */
function generateSchemasFromResolvedOptions(
  ctx: ProgramContext,
  filePath: string,
  typeName: string,
  resolved: {
    extensionRegistry: MutableExtensionRegistry | undefined;
    vendorPrefix: string | undefined;
    enumSerialization: "enum" | "oneOf" | "smart-size" | undefined;
    metadata: MetadataPolicyInput | undefined;
  },
  discriminator: DiscriminatorResolutionOptions | undefined
): DetailedClassSchemasResult {
  const analysisResult: AnalyzeNamedTypeToIRDetailedResult =
    analyzeNamedTypeToIRFromProgramContextDetailed(
      ctx,
      filePath,
      typeName,
      resolved.extensionRegistry,
      resolved.metadata,
      discriminator
    );
  if (!analysisResult.ok) {
    return {
      ok: false,
      diagnostics: analysisResult.diagnostics,
    };
  }

  return generateClassSchemasDetailed(
    analysisResult.analysis,
    { file: filePath },
    {
      extensionRegistry: resolved.extensionRegistry,
      metadata: resolved.metadata,
      enumSerialization: resolved.enumSerialization,
      vendorPrefix: resolved.vendorPrefix,
    }
  );
}

function withTarget(
  target: SchemaGenerationTarget,
  result: DetailedClassSchemasResult
): DetailedSchemaGenerationTargetResult {
  return {
    filePath: target.filePath,
    typeName: target.typeName,
    ...result,
  };
}

function createProgramContextFailureDiagnostic(
  filePath: string,
  error: unknown
): ValidationDiagnostic {
  return {
    code: "PROGRAM_CONTEXT_FAILURE",
    message: error instanceof Error ? error.message : String(error),
    severity: "error",
    primaryLocation: {
      surface: "tsdoc",
      file: filePath,
      line: 1,
      column: 0,
    },
    relatedLocations: [],
  };
}
