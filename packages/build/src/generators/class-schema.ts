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
import type { ExtensionRegistry } from "../extensions/index.js";
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
    diagnostics: analysisDiagnostics,
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
   * Registry used to resolve custom types, constraints, and annotations.
   */
  readonly extensionRegistry?: ExtensionRegistry | undefined;
  /**
   * Vendor prefix for emitted extension keywords.
   * @defaultValue "x-formspec"
   */
  readonly vendorPrefix?: string | undefined;
  /** Metadata resolution policy for static schema generation. */
  readonly metadata?: MetadataPolicyInput | undefined;
  /** Discriminator-specific schema generation behavior. */
  readonly discriminator?: DiscriminatorResolutionOptions | undefined;
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
  const ctx = createProgramContext(options.filePath);
  const classDecl = findClassByName(ctx.sourceFile, options.className);

  if (!classDecl) {
    throw new Error(`Class "${options.className}" not found in ${options.filePath}`);
  }

  const analysis = analyzeClassToIR(
    classDecl,
    ctx.checker,
    options.filePath,
    options.extensionRegistry,
    options.metadata,
    options.discriminator
  );
  return generateClassSchemas(
    analysis,
    { file: options.filePath },
    {
      extensionRegistry: options.extensionRegistry,
      metadata: options.metadata,
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
  filePath: string;
  /** Name of the exported class, interface, or type alias to analyze */
  typeName: string;
}

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
 * });
 * ```
 *
 * @param options - File path and type name
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
export function generateSchemas(options: GenerateSchemasOptions): GenerateFromClassResult {
  const ctx = createProgramContext(options.filePath);
  return generateSchemasFromProgram({
    ...options,
    program: ctx.program,
  });
}

/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program supplied by the caller.
 *
 * This low-level entry point lets downstream tooling reuse a host-owned
 * `Program` for both FormSpec extraction and other TypeScript analysis.
 *
 * @param options - Host program, file path, type name, and optional schema generation options
 * @returns Generated JSON Schema and UI Schema
 *
 * @public
 */
export function generateSchemasFromProgram(
  options: GenerateSchemasFromProgramOptions
): GenerateFromClassResult;
export function generateSchemasFromProgram(
  options: GenerateSchemasFromProgramOptions
): GenerateFromClassResult {
  const result = generateSchemasFromProgramDetailed(options);
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
 *
 * @public
 */
export function generateSchemasDetailed(
  options: GenerateSchemasOptions
): DetailedClassSchemasResult {
  try {
    const ctx = createProgramContext(options.filePath);
    return generateSchemasFromDetailedProgramContext(
      ctx,
      options.filePath,
      options.typeName,
      options
    );
  } catch (error) {
    return {
      ok: false,
      diagnostics: [createProgramContextFailureDiagnostic(options.filePath, error)],
    };
  }
}

/**
 * Generates JSON Schema and UI Schema from a named type within an existing
 * TypeScript program and returns structured diagnostics instead of throwing on
 * validation or analysis failures.
 *
 * @public
 */
export function generateSchemasFromProgramDetailed(
  options: GenerateSchemasFromProgramOptions
): DetailedClassSchemasResult {
  try {
    const ctx = createProgramContextFromProgram(options.program, options.filePath);
    return generateSchemasFromDetailedProgramContext(
      ctx,
      options.filePath,
      options.typeName,
      options
    );
  } catch (error) {
    return {
      ok: false,
      diagnostics: [createProgramContextFailureDiagnostic(options.filePath, error)],
    };
  }
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

  return options.targets.map((target) => {
    try {
      const cacheKey = ts.sys.useCaseSensitiveFileNames
        ? target.filePath
        : target.filePath.toLowerCase();
      let ctx = contextCache.get(cacheKey);
      if (ctx === undefined) {
        ctx = createProgramContext(target.filePath);
        contextCache.set(cacheKey, ctx);
      }

      return withTarget(
        target,
        generateSchemasFromDetailedProgramContext(ctx, target.filePath, target.typeName, options)
      );
    } catch (error) {
      return withTarget(target, {
        ok: false,
        diagnostics: [createProgramContextFailureDiagnostic(target.filePath, error)],
      });
    }
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
    try {
      const ctx = createProgramContextFromProgram(options.program, target.filePath);
      return withTarget(
        target,
        generateSchemasFromDetailedProgramContext(ctx, target.filePath, target.typeName, options)
      );
    } catch (error) {
      return withTarget(target, {
        ok: false,
        diagnostics: [createProgramContextFailureDiagnostic(target.filePath, error)],
      });
    }
  });
}

function generateSchemasFromDetailedProgramContext(
  ctx: ProgramContext,
  filePath: string,
  typeName: string,
  options: StaticSchemaGenerationOptions
): DetailedClassSchemasResult {
  const analysisResult: AnalyzeNamedTypeToIRDetailedResult =
    analyzeNamedTypeToIRFromProgramContextDetailed(
      ctx,
      filePath,
      typeName,
      options.extensionRegistry,
      options.metadata,
      options.discriminator
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
      extensionRegistry: options.extensionRegistry,
      metadata: options.metadata,
      vendorPrefix: options.vendorPrefix,
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
