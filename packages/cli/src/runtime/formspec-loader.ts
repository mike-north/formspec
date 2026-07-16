/**
 * FormSpec loader for dynamic import and runtime access.
 *
 * Loads compiled TypeScript modules and extracts:
 * - Exported FormSpec constants (chain DSL)
 * - Specific exports by name (for method parameters)
 *
 * Uses the @formspec/build package to generate schemas from FormSpec objects.
 */

import {
  generateJsonSchema,
  generateUiSchema,
  type GenerateJsonSchemaOptions,
  type JsonSchema2020,
  type UISchema,
} from "@formspec/build";
import { canonicalizeChainDSL, generateJsonSchemaFromIR } from "@formspec/build/internals";
import type { GenerateJsonSchemaFromIROptions } from "@formspec/build/internals";
import type { FormSpecSerializationConfig } from "@formspec/config";
import type { MetadataPolicyInput } from "@formspec/core";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * A FormSpec object (duck-typed for runtime detection).
 */
interface FormSpecLike {
  elements: unknown[];
}

interface LoadFormSpecsOptions {
  /** Vendor prefix for emitted extension keywords. */
  readonly vendorPrefix?: string | undefined;
  /** JSON Schema representation to use for static enums. */
  readonly enumSerialization?: "enum" | "oneOf" | "smart-size" | undefined;
  /** Forward-looking serialization settings for vocabulary and dialect transport. */
  readonly serialization?: FormSpecSerializationConfig | undefined;
  /**
   * Naming inference policy (apiName/displayName/pluralization). Keeps
   * chain-DSL exports on the same semantic model as class-based generation
   * instead of silently falling back to built-in defaults. See issue #522
   * (which also fixed the equivalent gap on the class-based path, in
   * `src/index.ts`'s `schemaOptions`).
   *
   * Note: `config.extensions` still cannot flow to chain-DSL runtime
   * generation — `GenerateJsonSchemaOptions` has no `extensions` field. That
   * remains a documented `@formspec/build` API-surface gap, tracked in
   * issue #614 (not fixed here).
   */
  readonly metadata?: MetadataPolicyInput | undefined;
}

/**
 * Result of loading and generating schemas from a FormSpec.
 */
export interface FormSpecSchemas {
  /** The FormSpec export name */
  name: string;
  /** Generated JSON Schema */
  jsonSchema: JsonSchema2020;
  /** Generated UI Schema (FormSpec/JSON Forms) */
  uiSchema: UISchema;
}

/**
 * Result of loading all FormSpecs from a module.
 */
interface ModuleFormSpecs {
  /** All FormSpec exports found in the module */
  formSpecs: Map<string, FormSpecSchemas>;
  /** The raw module for accessing other exports */
  module: Record<string, unknown>;
  /**
   * Export names that duck-typed as a FormSpec (per {@link isFormSpec}) but
   * whose schema generation threw, mapped to a human-readable failure cause.
   * Callers use this to decide whether a "generate" run should report
   * failure instead of silently omitting the export from its output.
   */
  failures: Map<string, string>;
}

/**
 * Result of loading specific FormSpec exports by name.
 */
interface NamedFormSpecs {
  /** Found exports, keyed by name. */
  formSpecs: Map<string, FormSpecSchemas>;
  /**
   * Export names that were detected but whose schema generation threw,
   * mapped to a human-readable failure cause. Does not include exports that
   * were missing or not FormSpec-shaped — those remain warn-only, since they
   * indicate a stale static reference rather than a generation failure.
   */
  failures: Map<string, string>;
}

function toPublicJsonSchemaOptions(
  options: LoadFormSpecsOptions | undefined
): GenerateJsonSchemaOptions | undefined {
  if (
    options?.vendorPrefix === undefined &&
    options?.enumSerialization === undefined &&
    options?.metadata === undefined
  ) {
    return undefined;
  }

  return {
    ...(options.vendorPrefix !== undefined && { vendorPrefix: options.vendorPrefix }),
    ...(options.enumSerialization !== undefined && {
      enumSerialization: options.enumSerialization,
    }),
    ...(options.metadata !== undefined && { metadata: options.metadata }),
  };
}

function generateRuntimeJsonSchema(
  formSpec: FormSpecLike,
  options: LoadFormSpecsOptions | undefined
): JsonSchema2020 {
  const publicOptions = toPublicJsonSchemaOptions(options);

  if (options?.serialization === undefined) {
    return generateJsonSchema(formSpec as never, publicOptions);
  }

  const internalOptions: GenerateJsonSchemaFromIROptions = {
    ...publicOptions,
    serialization: options.serialization,
  };
  const ir = canonicalizeChainDSL(formSpec as never);
  return generateJsonSchemaFromIR(ir, internalOptions);
}

/**
 * Logs a schema-generation failure for a FormSpec export and returns a
 * concise cause string for tracking in a `failures` map.
 *
 * The raw error is passed to `console.warn` as a separate argument (rather
 * than interpolated into the message string via `String(error)`) so Node's
 * console formatting can render non-`Error` throwables — e.g. a plain object
 * — usefully, instead of collapsing them to `"[object Object]"`.
 */
function warnGenerationFailure(name: string, error: unknown): string {
  const cause = error instanceof Error ? error.message : String(error);
  console.warn(`Warning: Failed to generate schemas for export "${name}":`, error);
  return cause;
}

/**
 * Checks if a value is a FormSpec object.
 *
 * Uses duck typing since the actual FormSpec type may come from
 * different package versions.
 */
export function isFormSpec(value: unknown): value is FormSpecLike {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // FormSpec objects have an 'elements' array property
  const elements = obj["elements"];
  if (!Array.isArray(elements)) {
    return false;
  }

  // Each element should have a _type property with a string value
  return elements.every(
    (el) =>
      el !== null && typeof el === "object" && typeof (el as { _type?: unknown })._type === "string"
  );
}

/**
 * Loads a module and extracts all FormSpec exports.
 *
 * This handles both:
 * - Chain DSL: `export const MyForm = formspec(...)`
 * - Method parameters: exports referenced by `InferSchema<typeof X>`
 *
 * @param filePath - Path to the compiled JavaScript file
 * @returns Map of export names to their generated schemas
 */
export async function loadFormSpecs(
  filePath: string,
  options?: LoadFormSpecsOptions
): Promise<ModuleFormSpecs> {
  const absolutePath = path.resolve(filePath);

  // Convert to file URL for ESM import
  const fileUrl = pathToFileURL(absolutePath).href;

  // Dynamic import
  const module = (await import(fileUrl)) as Record<string, unknown>;

  const formSpecs = new Map<string, FormSpecSchemas>();
  const failures = new Map<string, string>();

  // Find all FormSpec exports
  for (const [name, value] of Object.entries(module)) {
    if (isFormSpec(value)) {
      try {
        // Use @formspec/build generators
        // The types expect FormSpec<readonly FormElement[]>
        // but we're duck-typing at runtime
        const jsonSchema = generateRuntimeJsonSchema(value, options);
        const uiSchema = generateUiSchema(value as never);

        formSpecs.set(name, {
          name,
          jsonSchema,
          uiSchema,
        });
      } catch (error) {
        failures.set(name, warnGenerationFailure(name, error));
      }
    }
  }

  return { formSpecs, module, failures };
}

/**
 * Loads specific FormSpec exports by name.
 *
 * Use this when you know which exports to load (e.g., from static analysis
 * of `InferSchema<typeof X>` patterns in method parameters).
 *
 * @param filePath - Path to the compiled JavaScript file
 * @param exportNames - Names of exports to load
 * @returns Found FormSpecs with their schemas, plus any generation failures
 */
export async function loadNamedFormSpecs(
  filePath: string,
  exportNames: string[],
  options?: LoadFormSpecsOptions
): Promise<NamedFormSpecs> {
  const { formSpecs, module, failures: scanFailures } = await loadFormSpecs(filePath, options);
  const result = new Map<string, FormSpecSchemas>();
  const failures = new Map<string, string>(scanFailures);

  for (const name of exportNames) {
    // Check if we already have it from the full scan
    const existing = formSpecs.get(name);
    if (existing) {
      result.set(name, existing);
      continue;
    }

    // Already recorded as a failure by the full-module scan above.
    if (failures.has(name)) {
      continue;
    }

    // Try to access it directly from the module
    const value = module[name];
    if (value && isFormSpec(value)) {
      try {
        const jsonSchema = generateRuntimeJsonSchema(value, options);
        const uiSchema = generateUiSchema(value as never);
        result.set(name, { name, jsonSchema, uiSchema });
      } catch (error) {
        failures.set(name, warnGenerationFailure(name, error));
      }
    } else if (value) {
      console.warn(`Warning: Export "${name}" exists but is not a valid FormSpec object`);
    } else {
      console.warn(`Warning: Export "${name}" not found in module`);
    }
  }

  return { formSpecs: result, failures };
}

/**
 * Resolves the compiled JS path from a TS source path.
 *
 * Assumes in-place (same-directory) compilation and maps extensions per
 * TypeScript's NodeNext emit conventions:
 * - .mts → .mjs
 * - .cts → .cjs
 * - .ts / .tsx → .js
 *
 * @param tsPath - Path to the TypeScript source file
 * @returns Path to the expected compiled JS file
 */
export function resolveCompiledPath(tsPath: string): string {
  const absolutePath = path.resolve(tsPath);
  const ext = path.extname(absolutePath);

  // Already a JS file
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return absolutePath;
  }

  if (ext === ".mts") {
    return absolutePath.slice(0, -ext.length) + ".mjs";
  }
  if (ext === ".cts") {
    return absolutePath.slice(0, -ext.length) + ".cjs";
  }
  if (ext === ".ts" || ext === ".tsx") {
    return absolutePath.slice(0, -ext.length) + ".js";
  }

  // Unrecognized extension: return unchanged (actual existence check
  // happens at import time).
  return absolutePath;
}
