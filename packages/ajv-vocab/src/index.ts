/**
 * `@formspec/ajv-vocab` - Ajv vocabulary registration for FormSpec annotation keywords
 *
 * This package registers FormSpec's custom JSON Schema extension keywords with an
 * Ajv instance so that schemas containing these annotations pass validation without
 * errors in strict mode.
 *
 * FormSpec emits extension keywords in generated JSON Schemas, using a vendor prefix
 * (default: `formspec`):
 * - `x-{prefix}-source` — identifies the dynamic-enum data source name
 * - `x-{prefix}-params` — lists the parameter names required by the data source
 * - `x-{prefix}-schemaSource` — identifies the class name used as a schema source
 *
 * These keywords are annotation-only: they carry metadata but have no validation
 * effect on the data being validated.
 *
 * Additional extension-registered keywords can be passed via `additionalKeywords`.
 *
 * @example
 * ```typescript
 * import { Ajv } from "ajv";
 * import { registerFormSpecVocabulary } from "@formspec/ajv-vocab";
 *
 * const ajv = new Ajv({ strict: true });
 * registerFormSpecVocabulary(ajv);
 *
 * // Now schemas with x-formspec-* keywords will validate without errors
 * const validate = ajv.compile({
 *   type: "string",
 *   "x-formspec-source": "countries",
 * });
 * ```
 *
 * @example Custom vendor prefix
 * ```typescript
 * import { Ajv } from "ajv";
 * import { registerFormSpecVocabulary } from "@formspec/ajv-vocab";
 *
 * const ajv = new Ajv({ strict: true });
 * registerFormSpecVocabulary(ajv, { vendorPrefix: "myapp" });
 *
 * // Registers x-myapp-source, x-myapp-params, x-myapp-schemaSource
 * ```
 *
 * @packageDocumentation
 */

import type { KeywordDefinition } from "ajv";

/**
 * Minimal structural interface for the subset of the Ajv API used by this
 * package. Using a structural interface avoids the `esModuleInterop` /
 * `verbatimModuleSyntax` incompatibility that arises when importing the Ajv
 * class directly from its CJS-only package.
 *
 * Any Ajv v8 instance satisfies this interface.
 *
 * @public
 */
export interface AjvLike {
  /** Adds a new keyword definition to this Ajv instance. */
  addKeyword(kwdOrDef: string | KeywordDefinition, def?: KeywordDefinition): unknown;
  /** Returns the keyword definition, or `false` if the keyword is not defined. */
  getKeyword(keyword: string): KeywordDefinition | boolean;
}

/**
 * Options for {@link registerFormSpecVocabulary}.
 *
 * @public
 */
export interface RegisterVocabularyOptions {
  /**
   * The vendor prefix used in extension keyword names.
   *
   * Keywords are registered as `x-{vendorPrefix}-source`,
   * `x-{vendorPrefix}-params`, and `x-{vendorPrefix}-schemaSource`.
   *
   * @defaultValue `"formspec"`
   */
  vendorPrefix?: string;

  /**
   * Additional extension keyword names to register as annotation-only
   * keywords alongside the built-in FormSpec keywords.
   *
   * Use this to register vocabulary keywords emitted by extensions so that
   * Ajv does not reject them in strict mode.
   *
   * @example
   * ```typescript
   * registerFormSpecVocabulary(ajv, {
   *   additionalKeywords: ["x-myext-customField"],
   * });
   * ```
   */
  additionalKeywords?: readonly string[];
}

/**
 * The suffix portion of the built-in FormSpec extension keywords (without
 * the `x-{prefix}-` prefix). Combined with the resolved vendor prefix at
 * registration time.
 */
const BUILTIN_KEYWORD_SUFFIXES = ["source", "params", "schemaSource"] as const;

/**
 * Registers FormSpec annotation keywords with the provided Ajv instance.
 *
 * Call this once after creating your Ajv instance and before compiling any
 * FormSpec-generated schemas. Without registration, Ajv in strict mode will
 * throw an error when it encounters unknown extension keywords.
 *
 * Registration is idempotent: calling this function multiple times on the
 * same Ajv instance with the same prefix is safe.
 *
 * @param ajv - The Ajv instance to register the vocabulary on.
 * @param options - Optional configuration for the vendor prefix and
 *   additional extension keywords.
 *
 * @public
 */
export function registerFormSpecVocabulary(
  ajv: AjvLike,
  options?: RegisterVocabularyOptions
): void {
  const prefix = options?.vendorPrefix ?? "formspec";
  const builtinKeywords = BUILTIN_KEYWORD_SUFFIXES.map((suffix) => `x-${prefix}-${suffix}`);

  const additionalKeywords = options?.additionalKeywords ?? [];

  const allKeywords = [...builtinKeywords, ...additionalKeywords];

  for (const keyword of allKeywords) {
    // Skip keywords already registered to allow idempotent calls.
    if (ajv.getKeyword(keyword) !== false) {
      continue;
    }
    ajv.addKeyword({
      keyword,
      // schema: false means the keyword value is not validated against a
      // metaSchema — it is treated as opaque annotation metadata.
      schema: false,
    });
  }
}
