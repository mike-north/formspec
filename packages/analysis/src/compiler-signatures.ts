import * as ts from "typescript";
import type { Provenance } from "@formspec/core/internals";
import { FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES } from "./constants.js";
import { LruCache } from "./lru-cache.js";
import { optionalMeasure, type FormSpecPerformanceRecorder } from "./perf-tracing.js";
import { type ConstraintSemanticDiagnostic } from "./semantic-targets.js";
import {
  getAllTagDefinitions,
  getTagDefinition,
  type ExtensionTagSource,
  type FormSpecPlacement,
  type FormSpecValueKind,
  type TagDefinition,
  type TagSignature,
  type TagSignatureParameter,
} from "./tag-registry.js";
import { getSyntheticLogger, logSetupDiagnostics } from "./constraint-validator-logger.js";

/**
 * Target kinds that can be represented in a synthetic compiler call.
 *
 * This intentionally excludes `"none"`, because a missing target is modeled by
 * omitting the synthetic target argument entirely.
 */
export type SyntheticTagTargetKind = "path" | "member" | "variant";

/**
 * A normalized target argument that can be lowered into a synthetic helper
 * call for compiler-backed validation.
 */
export interface SyntheticTagTargetSpecifier {
  readonly kind: SyntheticTagTargetKind;
  readonly text: string;
}

/**
 * Inputs required to lower a parsed FormSpec tag into a synthetic TypeScript
 * helper call.
 *
 * `hostType` and `subjectType` are trusted snippets of TypeScript type syntax
 * supplied by the caller. They are embedded into an in-memory synthetic source
 * file and are never executed.
 */
export interface LowerSyntheticTagApplicationOptions {
  readonly tagName: string;
  readonly placement: FormSpecPlacement;
  readonly hostType: string;
  readonly subjectType: string;
  readonly target?: SyntheticTagTargetSpecifier | null;
  readonly argumentExpression?: string | null;
  readonly extensions?: readonly ExtensionTagSource[];
}

/**
 * Result of lowering a tag application into the synthetic call representation
 * used for compiler-backed validation.
 */
export interface LoweredSyntheticTagApplication {
  readonly definition: TagDefinition;
  readonly matchingSignatures: readonly TagSignature[];
  readonly callExpression: string;
}

/**
 * A simplified TypeScript diagnostic surfaced from the synthetic compiler pass.
 *
 * @internal
 */
export interface SyntheticCompilerDiagnostic {
  /** The category of diagnostic: a raw TypeScript error, an unsupported global built-in override, or a synthetic setup failure. */
  readonly kind: "typescript" | "unsupported-custom-type-override" | "synthetic-setup";
  /** TypeScript diagnostic code, or -1 for non-TypeScript diagnostics. */
  readonly code: number;
  /** Human-readable description of the diagnostic. */
  readonly message: string;
}

interface SyntheticSetupError extends Error {
  diagnosticKind: Exclude<SyntheticCompilerDiagnostic["kind"], "typescript">;
}

/**
 * Options for running the TypeScript checker against a synthetic tag call.
 */
export interface CheckSyntheticTagApplicationOptions extends LowerSyntheticTagApplicationOptions {
  readonly supportingDeclarations?: readonly string[];
  readonly performance?: FormSpecPerformanceRecorder;
  readonly compilerOptions?: ts.CompilerOptions;
}

/**
 * Result of checking a lowered synthetic tag application with the TypeScript
 * compiler.
 */
export interface SyntheticTagCheckResult {
  readonly sourceText: string;
  readonly diagnostics: readonly SyntheticCompilerDiagnostic[];
}

/**
 * Detailed synthetic batch result that keeps compiler diagnostics which do not
 * belong to any single lowered application separate from per-application
 * results.
 */
export interface SyntheticBatchCheckResult {
  readonly sourceText: string;
  readonly applicationResults: readonly SyntheticTagCheckResult[];
  readonly globalDiagnostics: readonly SyntheticCompilerDiagnostic[];
}

/**
 * Options for the minimal synthetic applicability checker that operates on an
 * already-resolved target type instead of reproducing path/member resolution in
 * the synthetic program.
 */
export interface CheckNarrowSyntheticTagApplicabilityOptions {
  readonly tagName: string;
  readonly placement: FormSpecPlacement;
  readonly resolvedTargetType: string;
  readonly targetKind?: SyntheticTagTargetKind | null;
  readonly argumentExpression?: string | null;
  readonly extensions?: readonly ExtensionTagSource[];
  readonly performance?: FormSpecPerformanceRecorder;
}

/**
 * Options for running the minimal synthetic applicability checker against
 * multiple already-resolved target types in a single in-memory program.
 */
export interface CheckNarrowSyntheticTagApplicabilitiesOptions {
  readonly applications: readonly CheckNarrowSyntheticTagApplicabilityOptions[];
  readonly performance?: FormSpecPerformanceRecorder;
  readonly compilerOptions?: ts.CompilerOptions;
}

/**
 * Options for running the TypeScript checker against multiple lowered
 * synthetic tag calls in a single in-memory program.
 */
export interface CheckSyntheticTagApplicationsOptions {
  readonly applications: readonly CheckSyntheticTagApplicationOptions[];
  readonly performance?: FormSpecPerformanceRecorder;
  readonly compilerOptions?: ts.CompilerOptions;
}

const SYNTHETIC_CHECK_EVENT = {
  batch: "analysis.syntheticCheckBatch",
  narrowBatch: "analysis.narrowSyntheticCheckBatch",
} as const;

const PRELUDE_LINES = [
  "type FormSpecPlacement =",
  '  | "class"',
  '  | "class-field"',
  '  | "class-method"',
  '  | "interface"',
  '  | "interface-field"',
  '  | "type-alias"',
  '  | "type-alias-field"',
  '  | "variable"',
  '  | "function"',
  '  | "function-parameter"',
  '  | "method-parameter";',
  "",
  "type FormSpecCapability =",
  '  | "numeric-comparable"',
  '  | "string-like"',
  '  | "array-like"',
  '  | "enum-member-addressable"',
  '  | "json-like"',
  '  | "condition-like"',
  '  | "object-like";',
  "",
  "interface TagContext<P extends FormSpecPlacement, Host, Subject> {",
  "  readonly placement: P;",
  "  readonly hostType: Host;",
  "  readonly subjectType: Subject;",
  "}",
  "",
  "type NonNullish<T> = Exclude<T, null | undefined>;",
  "",
  "type ProvidesCapability<T, Capability extends FormSpecCapability> =",
  '  Capability extends "numeric-comparable"',
  "    ? NonNullish<T> extends number | bigint",
  "      ? true",
  "      : false",
  '    : Capability extends "string-like"',
  "      ? NonNullish<T> extends string",
  "        ? true",
  "        : false",
  '      : Capability extends "array-like"',
  "        ? NonNullish<T> extends readonly unknown[]",
  "          ? true",
  "          : false",
  '        : Capability extends "enum-member-addressable"',
  "          ? NonNullish<T> extends string",
  "            ? true",
  "            : false",
  '          : Capability extends "json-like"',
  "            ? true",
  '            : Capability extends "condition-like"',
  "              ? true",
  '              : Capability extends "object-like"',
  "                ? NonNullish<T> extends readonly unknown[]",
  "                  ? false",
  "                  : NonNullish<T> extends object",
  "                    ? true",
  "                    : false",
  "                : false;",
  "",
  "type NestedPathOfCapability<Subject, Capability extends FormSpecCapability> =",
  "  NonNullish<Subject> extends readonly (infer Item)[]",
  "    ? NestedPathOfCapability<Item, Capability>",
  "    : NonNullish<Subject> extends object",
  "      ? {",
  "          [Key in Extract<keyof NonNullish<Subject>, string>]:",
  "            | (ProvidesCapability<NonNullish<Subject>[Key], Capability> extends true ? Key : never)",
  "            | (NestedPathOfCapability<NonNullish<Subject>[Key], Capability> extends never",
  "                ? never",
  "                : `${Key}.${NestedPathOfCapability<NonNullish<Subject>[Key], Capability>}`);",
  "        }[Extract<keyof NonNullish<Subject>, string>]",
  "      : never;",
  "",
  "type PathOfCapability<Subject, Capability extends FormSpecCapability> =",
  "  NestedPathOfCapability<Subject, Capability>;",
  "",
  "type MemberTarget<Subject> = Extract<keyof NonNullish<Subject>, string>;",
  "",
  'type VariantTarget<Subject> = "singular" | "plural";',
  "",
  "type FormSpecCondition = unknown;",
  "type JsonValue = unknown;",
  "",
  "declare function __ctx<P extends FormSpecPlacement, Host, Subject>(): TagContext<P, Host, Subject>;",
  "declare function __path<Subject, Capability extends FormSpecCapability>(",
  "  path: PathOfCapability<Subject, Capability>",
  "): PathOfCapability<Subject, Capability>;",
  "declare function __member<Subject>(member: MemberTarget<Subject>): MemberTarget<Subject>;",
  "declare function __variant<Subject>(variant: VariantTarget<Subject>): VariantTarget<Subject>;",
] as const;

function placementUnion(placements: readonly FormSpecPlacement[]): string {
  return placements.map((placement) => JSON.stringify(placement)).join(" | ");
}

function renderValueType(valueKind: FormSpecValueKind | undefined): string {
  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      return "number";
    case "string":
      return "string";
    case "json":
      return "JsonValue";
    case "boolean":
      return "boolean";
    case "condition":
      return "FormSpecCondition";
    case undefined:
      return "unknown";
    default: {
      const exhaustive: never = valueKind;
      return exhaustive;
    }
  }
}

function renderTargetParameterType(parameter: TagSignatureParameter): string {
  switch (parameter.kind) {
    case "target-path":
      return parameter.capability === undefined
        ? "PathOfCapability<Subject, FormSpecCapability>"
        : `PathOfCapability<Subject, ${JSON.stringify(parameter.capability)}>`;
    case "target-member":
      return "MemberTarget<Subject>";
    case "target-variant":
      return "VariantTarget<Subject>";
    case "value":
      return renderValueType(parameter.valueKind);
    default: {
      const exhaustive: never = parameter.kind;
      return exhaustive;
    }
  }
}

function renderNarrowValueType(valueKind: FormSpecValueKind | undefined): string {
  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      return "number";
    case "string":
      return "string";
    case "json":
      return "JsonValue";
    case "boolean":
      return "boolean";
    case "condition":
      return "FormSpecCondition";
    case undefined:
      return "unknown";
    default: {
      const exhaustive: never = valueKind;
      return exhaustive;
    }
  }
}

function renderSignature(tagName: string, signature: TagSignature): string {
  const parameters = signature.parameters.map((parameter, index) => {
    const name = parameter.kind === "value" ? "value" : `target${String(index)}`;
    return `${name}: ${renderTargetParameterType(parameter)}`;
  });

  return [
    `  function ${getSyntheticTagHelperName(tagName)}<Host, Subject>(`,
    `    ctx: TagContext<${placementUnion(signature.placements)}, Host, Subject>${
      parameters.length > 0 ? "," : ""
    }`,
    ...parameters.map(
      (parameter, index) => `    ${parameter}${index === parameters.length - 1 ? "" : ","}`
    ),
    "  ): void;",
  ].join("\n");
}

function getSyntheticTagHelperName(tagName: string): string {
  return `tag_${tagName}`;
}

function targetKindForParameter(parameter: TagSignatureParameter): SyntheticTagTargetKind | null {
  switch (parameter.kind) {
    case "target-path":
      return "path";
    case "target-member":
      return "member";
    case "target-variant":
      return "variant";
    case "value":
      return null;
    default: {
      const exhaustive: never = parameter.kind;
      return exhaustive;
    }
  }
}

function getSignatureTargetKind(signature: TagSignature): SyntheticTagTargetKind | null {
  for (const parameter of signature.parameters) {
    const targetKind = targetKindForParameter(parameter);
    if (targetKind !== null) {
      return targetKind;
    }
  }

  return null;
}

function getTargetParameter(
  signature: TagSignature
): Exclude<TagSignatureParameter, { kind: "value" }> | null {
  return (
    signature.parameters.find(
      (parameter): parameter is Exclude<TagSignatureParameter, { kind: "value" }> =>
        parameter.kind !== "value"
    ) ?? null
  );
}

function getPathTargetCapability(signature: TagSignature): string {
  const parameter = getTargetParameter(signature);
  if (parameter?.kind !== "target-path") {
    throw new Error(`Invariant violation: expected a path-target synthetic signature`);
  }
  if (parameter.capability === undefined) {
    throw new Error(
      `Invariant violation: path-target synthetic signatures must declare a capability`
    );
  }

  return JSON.stringify(parameter.capability);
}

function renderTargetArgument(
  target: SyntheticTagTargetSpecifier,
  signature: TagSignature,
  subjectType: string
): string {
  switch (target.kind) {
    case "path":
      return `__path<${subjectType}, ${getPathTargetCapability(signature)}>(${JSON.stringify(
        target.text
      )})`;
    case "member":
      return `__member<${subjectType}>(${JSON.stringify(target.text)})`;
    case "variant":
      return `__variant<${subjectType}>(${JSON.stringify(target.text)})`;
  }
}

/**
 * Filters a tag definition's overloads down to the ones that apply to the
 * requested placement and synthetic target form.
 *
 * This is the overload-selection primitive used by both the lowering phase
 * and cursor-aware tooling that wants to show only the currently-applicable
 * signatures for a tag.
 */
export function getMatchingTagSignatures(
  definition: TagDefinition,
  placement: FormSpecPlacement,
  targetKind: SyntheticTagTargetKind | null
): readonly TagSignature[] {
  return definition.signatures.filter(
    (signature) =>
      signature.placements.includes(placement) && getSignatureTargetKind(signature) === targetKind
  );
}

/**
 * TypeScript primitive type keywords that cannot be used as type alias names
 * (TS2457: "Type alias name cannot be 'X'"). These are already known to the
 * TypeScript compiler, so no synthetic declaration is needed for them.
 */
const TS_PRIMITIVE_KEYWORDS = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
  "unknown",
  "void",
]);

/**
 * TypeScript global built-in type names that conflict with synthetic `type X =
 * unknown;` declarations (TS2300 "Duplicate identifier"). The boolean value
 * indicates whether FormSpec supports intercepting that type as a custom type
 * override (`true`) or not yet (`false`).
 *
 * To promote a type from unsupported to supported, change its value to `true`.
 * Supported types are skipped in the synthetic prelude (TypeScript's lib files
 * already declare them). Unsupported types produce a clear error when the
 * synthetic prelude is built during analysis, rather than a cryptic TS2300
 * duplicate-identifier error from the prelude.
 */
const TS_GLOBAL_BUILTIN_TYPES = new Map<string, boolean>([
  ["Date", true], // ISO 8601 datetime -- { type: "string", format: "date-time" }
  ["Array", false],
  ["ArrayBuffer", false],
  ["BigInt", false],
  ["Boolean", false],
  ["DataView", false],
  ["Error", false],
  ["EvalError", false],
  ["Float32Array", false],
  ["Float64Array", false],
  ["Function", false],
  ["Int16Array", false],
  ["Int32Array", false],
  ["Int8Array", false],
  ["Map", false],
  ["Number", false],
  ["Object", false],
  ["Promise", false],
  ["Proxy", false],
  ["RangeError", false],
  ["ReferenceError", false],
  ["RegExp", false],
  ["Set", false],
  ["SharedArrayBuffer", false],
  ["String", false],
  ["Symbol", false],
  ["SyntaxError", false],
  ["TypeError", false],
  ["URIError", false],
  ["Uint16Array", false],
  ["Uint32Array", false],
  ["Uint8Array", false],
  ["Uint8ClampedArray", false],
  ["WeakMap", false],
  ["WeakSet", false],
]);

/**
 * Maps a `SyntheticCompilerDiagnostic["kind"]` to the canonical diagnostic code
 * string used in `ConstraintSemanticDiagnostic.code` and
 * `FormSpecAnalysisDiagnostic.code`.
 *
 * Extracted to eliminate three identical ternary chains spread across
 * `tsdoc-parser.ts` (2 sites) and `file-snapshots.ts` (1 site). The switch is
 * exhaustive — the `never` default catches any future `kind` additions at
 * compile time.
 *
 * @internal
 */
export function _mapSetupDiagnosticCode(kind: SyntheticCompilerDiagnostic["kind"]): string {
  switch (kind) {
    case "unsupported-custom-type-override":
      return "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE";
    case "synthetic-setup":
      return "SYNTHETIC_SETUP_FAILURE";
    case "typescript":
      return "TYPE_MISMATCH";
    default: {
      // Exhaustive check — fails to compile if a new kind is added without
      // updating this mapping.
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Constructs the registry-level provenance for extension setup diagnostics.
 *
 * Extension setup failures are not tied to a specific source location — they
 * are detected at registry construction time, before any source file is
 * analyzed. We use `line: 1, column: 0` as the conventional registry-level
 * anchor, and `surface: "extension"` to distinguish them from tag-site
 * diagnostics.
 *
 * @param file - The source file path being analyzed when the diagnostic fires.
 * @internal
 */
export function _extensionRegistryProvenance(file: string): Provenance {
  return { surface: "extension", file, line: 1, column: 0 };
}

/**
 * Converts `registry.setupDiagnostics` into `ConstraintSemanticDiagnostic[]`
 * anchored at the extension-registration site for the given file.
 *
 * This helper is the single source of truth for the build path's pre-emit of
 * setup diagnostics (consumed by `parseTSDocTags`). It uses
 * `_extensionRegistryProvenance` for the anchor location and
 * `_mapSetupDiagnosticCode` for the kind → code mapping.
 *
 * @param setupDiags - The diagnostics from `ExtensionRegistry.setupDiagnostics`.
 * @param file - The source file path being analyzed.
 * @returns One `ConstraintSemanticDiagnostic` per setup diagnostic.
 * @internal
 */
export function _emitSetupDiagnostics(
  setupDiags: readonly SyntheticCompilerDiagnostic[],
  file: string
): readonly ConstraintSemanticDiagnostic[] {
  const provenance = _extensionRegistryProvenance(file);
  return setupDiags.map((d) => ({
    code: _mapSetupDiagnosticCode(d.kind),
    message: d.message,
    severity: "error" as const,
    primaryLocation: provenance,
    relatedLocations: [],
  }));
}

/**
 * Shared core of `_validateExtensionSetup` (non-throwing) and
 * `collectExtensionCustomTypeNames` (throwing).
 *
 * Iterates over all `tsTypeNames` across all extensions and calls `onValid`
 * for each name that passes validation, `onDiagnostic` for each name that
 * fails the non-throwing validation, and `onError` for each name that should
 * throw (the throwing path). When `onError` is undefined, errors are funnelled
 * to `onDiagnostic` instead.
 *
 * Skips TypeScript primitive keywords (TS2457) and supported global built-in
 * overrides (TS2300): both are already declared by the compiler.
 */
function _validateTypeNames(
  extensions: readonly ExtensionTagSource[],
  callbacks: {
    readonly onValid: (tsName: string) => void;
    readonly onDiagnostic: (diag: SyntheticCompilerDiagnostic) => void;
    /** When provided, called instead of `onDiagnostic` for hard errors. */
    readonly onError?: (
      kind: Exclude<SyntheticCompilerDiagnostic["kind"], "typescript">,
      message: string
    ) => never;
  }
): void {
  const seen = new Map<string, string>(); // tsName -> extensionId
  for (const ext of extensions) {
    for (const customType of ext.customTypes ?? []) {
      for (const tsName of customType.tsTypeNames) {
        // TypeScript already resolves primitive keywords; no declaration needed.
        if (TS_PRIMITIVE_KEYWORDS.has(tsName)) {
          continue;
        }
        const globalBuiltinSupported = TS_GLOBAL_BUILTIN_TYPES.get(tsName);
        if (globalBuiltinSupported === true) {
          // Already declared in TypeScript's lib files; skip to avoid TS2300.
          continue;
        }
        if (globalBuiltinSupported === false) {
          const message =
            `Custom type name "${tsName}" registered by extension "${ext.extensionId}" ` +
            `conflicts with a TypeScript global built-in type that FormSpec does not ` +
            `yet support overriding. Rename the custom type to a non-conflicting name.`;
          if (callbacks.onError !== undefined) {
            callbacks.onError("unsupported-custom-type-override", message);
          } else {
            callbacks.onDiagnostic({ kind: "unsupported-custom-type-override", code: -1, message });
          }
          continue;
        }
        // Guard against malformed names being interpolated into the synthetic
        // source (e.g. names with spaces, punctuation, or operator characters).
        if (!/^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(tsName)) {
          const message =
            `Invalid custom type name "${tsName}" registered by extension "${ext.extensionId}": ` +
            `must be a valid TypeScript identifier.`;
          if (callbacks.onError !== undefined) {
            callbacks.onError("synthetic-setup", message);
          } else {
            callbacks.onDiagnostic({ kind: "synthetic-setup", code: -1, message });
          }
          continue;
        }
        const existingExtensionId = seen.get(tsName);
        if (existingExtensionId !== undefined) {
          const message =
            `Duplicate custom type name "${tsName}" registered by extensions ` +
            `"${existingExtensionId}" and "${ext.extensionId}". ` +
            `Extension-registered types must have unique names.`;
          if (callbacks.onError !== undefined) {
            callbacks.onError("synthetic-setup", message);
          } else {
            callbacks.onDiagnostic({ kind: "synthetic-setup", code: -1, message });
          }
          continue;
        }
        seen.set(tsName, ext.extensionId);
        callbacks.onValid(tsName);
      }
    }
  }
}

/**
 * Validates extension custom-type registrations and returns any setup
 * diagnostics without throwing.
 *
 * This is the non-throwing counterpart to `collectExtensionCustomTypeNames`.
 * Consumers (e.g. `createExtensionRegistry`) call this once at construction
 * time and carry the result forward, so that setup diagnostics are emitted
 * ONCE per registry rather than once per synthetic-batch call.
 *
 * §4 Phase 4 Slice C — relocates setup-diagnostic emission site from
 * `buildSyntheticHelperPrelude` (per-batch) to `createExtensionRegistry` (once).
 *
 * @internal
 */
export function _validateExtensionSetup(
  extensions: readonly ExtensionTagSource[] | undefined
): readonly SyntheticCompilerDiagnostic[] {
  if (extensions === undefined || extensions.length === 0) {
    return [];
  }
  const diagnostics: SyntheticCompilerDiagnostic[] = [];
  _validateTypeNames(extensions, {
    onValid: () => {
      /* only diagnostics needed here */
    },
    onDiagnostic: (diag) => {
      diagnostics.push(diag);
    },
  });
  return diagnostics;
}

/**
 * Collects deduplicated custom type names from extensions, suitable for
 * emission as `type X = unknown;` declarations in the synthetic prelude.
 *
 * Throws if the same name is registered more than once (across or within
 * extensions). Skips TypeScript primitive keywords (TS2457) and supported
 * global built-in type overrides (TS2300): both are already declared by the
 * compiler, and no synthetic declaration is needed. Registering these names
 * as `tsTypeNames` is still valid -- it means "match the native type."
 *
 * Throws if an unsupported TypeScript global built-in is registered. To add
 * support for a new global built-in, set its value to `true` in
 * `TS_GLOBAL_BUILTIN_TYPES`.
 *
 * Note: §4 Phase 4 Slice C — consumers that construct an `ExtensionRegistry`
 * should use `_validateExtensionSetup` at registry construction time instead.
 * This throwing function is retained for the synthetic-prelude path which
 * still catches and converts these errors inside `runBatchSyntheticCheck`.
 * After Phase 5 (synthetic deletion), this function can be removed.
 */
function collectExtensionCustomTypeNames(
  extensions: readonly ExtensionTagSource[] | undefined
): readonly string[] {
  if (extensions === undefined) {
    return [];
  }
  const result: string[] = [];
  _validateTypeNames(extensions, {
    onValid: (tsName) => {
      result.push(tsName);
    },
    onDiagnostic: () => {
      /* not reached — onError is always provided */
    },
    onError: (kind, message) => {
      throw createSyntheticSetupError(kind, message);
    },
  });
  return result;
}

/**
 * Builds the synthetic helper declarations used to validate FormSpec tag
 * applications through the TypeScript checker.
 *
 * The returned string is a virtual `.d.ts`-style prelude that declares the
 * `__formspec.*` helper namespace together with context, path, member, and
 * variant helper types. It is intended to be embedded into an in-memory
 * TypeScript program, never emitted to disk.
 */
export function buildSyntheticHelperPrelude(extensions?: readonly ExtensionTagSource[]): string {
  const lines: string[] = [...PRELUDE_LINES];

  // Emit synthetic type declarations for extension-registered custom types.
  // This allows the synthetic program to resolve types like `Decimal` that
  // are imported from external packages but registered in the extension.
  const customTypeNames = collectExtensionCustomTypeNames(extensions);
  if (customTypeNames.length > 0) {
    lines.push("");
    lines.push("// Extension-registered custom types");
    for (const tsName of customTypeNames) {
      lines.push(`type ${tsName} = unknown;`);
    }
  }

  lines.push("", "declare namespace __formspec {");

  for (const definition of getAllTagDefinitions(extensions)) {
    for (const signature of definition.signatures) {
      lines.push(renderSignature(definition.canonicalName, signature));
    }
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Lowers a normalized tag application into a synthetic helper call.
 *
 * The caller is responsible for supplying trusted `hostType` and `subjectType`
 * snippets that are valid TypeScript type syntax in the generated synthetic
 * program. This function does not sanitize those snippets; it only assembles
 * the helper call and selects the matching overload metadata.
 */
export function lowerTagApplicationToSyntheticCall(
  options: LowerSyntheticTagApplicationOptions
): LoweredSyntheticTagApplication {
  const definition = getTagDefinition(options.tagName, options.extensions);
  if (definition === null) {
    throw new Error(`Unknown FormSpec tag: ${options.tagName}`);
  }

  const targetKind = options.target?.kind ?? null;
  const matchingSignatures = getMatchingTagSignatures(definition, options.placement, targetKind);
  if (matchingSignatures.length === 0) {
    throw new Error(
      `No synthetic signature for @${definition.canonicalName} on placement "${options.placement}"` +
        (targetKind === null ? "" : ` with target kind "${targetKind}"`)
    );
  }

  const args = [
    `__ctx<${JSON.stringify(options.placement)}, ${options.hostType}, ${options.subjectType}>()`,
  ];
  const signature = matchingSignatures[0];
  if (signature === undefined) {
    throw new Error(
      `Invariant violation: missing synthetic signature for @${definition.canonicalName}`
    );
  }

  if (options.target !== undefined && options.target !== null) {
    args.push(renderTargetArgument(options.target, signature, options.subjectType));
  }

  if (options.argumentExpression !== undefined && options.argumentExpression !== null) {
    args.push(options.argumentExpression);
  }

  return {
    definition,
    matchingSignatures,
    callExpression: `__formspec.${getSyntheticTagHelperName(definition.canonicalName)}(${args.join(", ")});`,
  };
}

function createSyntheticCompilerHost(
  fileName: string,
  sourceText: string,
  compilerOptions: ts.CompilerOptions
): ts.CompilerHost {
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (requestedFileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (requestedFileName === fileName) {
      return ts.createSourceFile(requestedFileName, sourceText, languageVersion, true);
    }

    return originalGetSourceFile(
      requestedFileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    );
  };

  host.readFile = (requestedFileName) => {
    if (requestedFileName === fileName) {
      return sourceText;
    }
    return ts.sys.readFile(requestedFileName);
  };

  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || ts.sys.fileExists(requestedFileName);

  host.writeFile = () => undefined;
  return host;
}

const NARROW_PRELUDE_LINES = [
  "type FormSpecCapability =",
  '  | "numeric-comparable"',
  '  | "string-like"',
  '  | "array-like"',
  '  | "enum-member-addressable"',
  '  | "json-like"',
  '  | "condition-like"',
  '  | "object-like";',
  "",
  "type NonNullish<T> = Exclude<T, null | undefined>;",
  "",
  "type ProvidesCapability<T, Capability extends FormSpecCapability> =",
  '  Capability extends "numeric-comparable"',
  "    ? NonNullish<T> extends number | bigint",
  "      ? true",
  "      : false",
  '    : Capability extends "string-like"',
  "      ? NonNullish<T> extends string",
  "        ? true",
  "        : false",
  '      : Capability extends "array-like"',
  "        ? NonNullish<T> extends readonly unknown[]",
  "          ? true",
  "          : false",
  '        : Capability extends "enum-member-addressable"',
  "          ? NonNullish<T> extends string",
  "            ? true",
  "            : false",
  '          : Capability extends "json-like"',
  "            ? true",
  '            : Capability extends "condition-like"',
  "              ? true",
  '              : Capability extends "object-like"',
  "                ? NonNullish<T> extends readonly unknown[]",
  "                  ? false",
  "                  : NonNullish<T> extends object",
  "                    ? true",
  "                    : false",
  "                : false;",
  "",
  "type __AssertTrue<T extends true> = T;",
  "type __IsAssignable<Actual, Expected> = [Actual] extends [Expected] ? true : false;",
  "type JsonValue = unknown;",
  "type FormSpecCondition = unknown;",
] as const;

function getSignatureValueParameter(signature: TagSignature): TagSignatureParameter | null {
  return signature.parameters.find((parameter) => parameter.kind === "value") ?? null;
}

function getTargetCapabilityForSignature(
  definition: TagDefinition,
  signature: TagSignature,
  targetKind: SyntheticTagTargetKind | null
): string | null {
  if (targetKind === null) {
    return definition.capabilities[0] ?? null;
  }

  const targetParameter = getTargetParameter(signature);
  return targetParameter?.capability ?? null;
}

function buildNarrowSyntheticSourceBodyLines(
  definition: TagDefinition,
  signature: TagSignature,
  options: CheckNarrowSyntheticTagApplicabilityOptions
): string[] {
  const lines: string[] = [];
  lines.push(`type __Target = ${options.resolvedTargetType};`);

  const capability = getTargetCapabilityForSignature(
    definition,
    signature,
    options.targetKind ?? null
  );
  if (capability !== null) {
    lines.push(
      `type __CheckTarget = __AssertTrue<ProvidesCapability<__Target, ${JSON.stringify(capability)}>>;`
    );
  }

  const valueParameter = getSignatureValueParameter(signature);
  if (
    valueParameter?.kind === "value" &&
    options.argumentExpression !== undefined &&
    options.argumentExpression !== null
  ) {
    lines.push(`const __value = ${options.argumentExpression};`);
    lines.push("type __Value = typeof __value;");
    lines.push(
      `type __CheckValue = __AssertTrue<__IsAssignable<__Value, ${renderNarrowValueType(
        valueParameter.valueKind
      )}>>;`
    );
  }

  return lines;
}

function flattenDiagnosticMessage(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, "\n");
}

function createSyntheticSetupError(
  diagnosticKind: SyntheticSetupError["diagnosticKind"],
  message: string
): SyntheticSetupError {
  const error = new Error(message) as SyntheticSetupError;
  error.diagnosticKind = diagnosticKind;
  return error;
}

function isSyntheticSetupError(error: unknown): error is SyntheticSetupError {
  return error instanceof Error && "diagnosticKind" in error;
}

function isUnsupportedCustomTypeOverrideErrorMessage(message: string): boolean {
  return message.includes("conflicts with a TypeScript global built-in type");
}

const SYNTHETIC_COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  lib: ["lib.es2022.d.ts"],
  types: [],
};

const syntheticBatchResultCache = new LruCache<string, MappedBatchDiagnostics>(
  FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES
);

function getEffectiveSyntheticCompilerOptions(
  compilerOptionsOverrides?: ts.CompilerOptions
): ts.CompilerOptions {
  return compilerOptionsOverrides !== undefined
    ? { ...SYNTHETIC_COMPILER_OPTIONS, ...compilerOptionsOverrides }
    : SYNTHETIC_COMPILER_OPTIONS;
}

function stableSerializeCacheValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeCacheValue(entry)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerializeCacheValue(entry)}`)
    .join(",")}}`;
}

function buildSyntheticBatchCacheKey(
  sourceText: string,
  compilerOptionsOverrides?: ts.CompilerOptions
): string {
  return `${stableSerializeCacheValue(getEffectiveSyntheticCompilerOptions(compilerOptionsOverrides))}\n${sourceText}`;
}

interface SyntheticBatchApplication {
  readonly lowered: LoweredSyntheticTagApplication;
  readonly options: CheckSyntheticTagApplicationOptions;
}

interface NarrowSyntheticBatchApplication {
  readonly definition: TagDefinition;
  readonly signature: TagSignature;
  readonly options: CheckNarrowSyntheticTagApplicabilityOptions;
}

interface SyntheticBatchSource {
  readonly sourceText: string;
  readonly applicationLineRanges: readonly {
    readonly startLine: number;
    readonly endLine: number;
  }[];
}

interface MappedBatchDiagnostics {
  readonly applicationResults: readonly SyntheticTagCheckResult[];
  readonly globalDiagnostics: readonly SyntheticCompilerDiagnostic[];
}

function pushChunkLines(target: string[], chunk: string): void {
  target.push(...chunk.split("\n"));
}

function buildSyntheticBatchSource(
  applications: readonly SyntheticBatchApplication[]
): SyntheticBatchSource {
  const lines: string[] = [];
  pushChunkLines(lines, buildSyntheticHelperPrelude(collectBatchExtensions(applications)));
  lines.push("");

  const applicationLineRanges: {
    readonly startLine: number;
    readonly endLine: number;
  }[] = [];

  for (const [index, application] of applications.entries()) {
    const namespaceName = `__formspec_app_${String(index)}`;
    const startLine = lines.length;
    lines.push(`namespace ${namespaceName} {`);
    for (const declaration of application.options.supportingDeclarations ?? []) {
      pushChunkLines(lines, declaration);
    }
    lines.push(`type __Host = ${application.options.hostType};`);
    lines.push(`type __Subject = ${application.options.subjectType};`);
    lines.push(application.lowered.callExpression);
    lines.push("}");
    applicationLineRanges.push({
      startLine,
      endLine: lines.length - 1,
    });
  }

  return {
    sourceText: lines.join("\n"),
    applicationLineRanges,
  };
}

function buildNarrowSyntheticBatchSource(
  applications: readonly NarrowSyntheticBatchApplication[]
): SyntheticBatchSource {
  const lines = [...NARROW_PRELUDE_LINES, ""];
  const applicationLineRanges: {
    readonly startLine: number;
    readonly endLine: number;
  }[] = [];

  for (const [index, application] of applications.entries()) {
    const namespaceName = `__formspec_narrow_app_${String(index)}`;
    const startLine = lines.length;
    lines.push(`namespace ${namespaceName} {`);
    lines.push(
      ...buildNarrowSyntheticSourceBodyLines(
        application.definition,
        application.signature,
        application.options
      )
    );
    lines.push("}");
    applicationLineRanges.push({
      startLine,
      endLine: lines.length - 1,
    });
  }

  return {
    sourceText: lines.join("\n"),
    applicationLineRanges,
  };
}

function collectBatchExtensions(
  applications: readonly SyntheticBatchApplication[]
): readonly ExtensionTagSource[] | undefined {
  // Deduplicate by extensionId: when the same extension is referenced by
  // multiple applications in a batch, including it twice would cause
  // collectExtensionCustomTypeNames to throw on the duplicate custom type names.
  const seen = new Set<string>();
  const extensions: ExtensionTagSource[] = [];
  for (const application of applications) {
    for (const ext of application.options.extensions ?? []) {
      if (!seen.has(ext.extensionId)) {
        seen.add(ext.extensionId);
        extensions.push(ext);
      }
    }
  }
  return extensions.length === 0 ? undefined : extensions;
}

function mapBatchDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  sourceFile: ts.SourceFile,
  applicationLineRanges: readonly {
    readonly startLine: number;
    readonly endLine: number;
  }[]
): MappedBatchDiagnostics {
  const diagnosticsByApplication = applicationLineRanges.map<SyntheticCompilerDiagnostic[]>(
    () => []
  );
  const globalDiagnostics: SyntheticCompilerDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const serialized = {
      kind: "typescript" as const,
      code: diagnostic.code,
      message: flattenDiagnosticMessage(diagnostic.messageText),
    };
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
      globalDiagnostics.push(serialized);
      continue;
    }

    const line = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line;
    const applicationIndex = applicationLineRanges.findIndex(
      (range) => line >= range.startLine && line <= range.endLine
    );
    if (applicationIndex < 0) {
      globalDiagnostics.push(serialized);
      continue;
    }
    const targetResult = diagnosticsByApplication[applicationIndex];
    if (targetResult !== undefined) {
      targetResult.push(serialized);
    }
  }

  return {
    applicationResults: diagnosticsByApplication.map((diagnosticsForApplication) => ({
      sourceText: sourceFile.text,
      diagnostics: diagnosticsForApplication,
    })),
    globalDiagnostics,
  };
}

function runSyntheticProgram(
  fileName: string,
  sourceText: string,
  performance: FormSpecPerformanceRecorder | undefined,
  eventPrefix: string,
  missingSourceFileMessage: string,
  compilerOptionsOverrides?: ts.CompilerOptions
): {
  readonly sourceFile: ts.SourceFile;
  readonly diagnostics: readonly ts.Diagnostic[];
} {
  const effectiveOptions = getEffectiveSyntheticCompilerOptions(compilerOptionsOverrides);
  const host = optionalMeasure(performance, `${eventPrefix}.createCompilerHost`, undefined, () =>
    createSyntheticCompilerHost(fileName, sourceText, effectiveOptions)
  );
  const program = optionalMeasure(performance, `${eventPrefix}.createProgram`, undefined, () =>
    ts.createProgram([fileName], effectiveOptions, host)
  );
  const diagnostics = optionalMeasure(
    performance,
    `${eventPrefix}.getPreEmitDiagnostics`,
    undefined,
    () =>
      ts
        .getPreEmitDiagnostics(program)
        .filter(
          (diagnostic) => diagnostic.file === undefined || diagnostic.file.fileName === fileName
        )
  );
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new Error(missingSourceFileMessage);
  }

  return {
    sourceFile,
    diagnostics,
  };
}

interface BatchSyntheticCheckOptions<TApplication, TResolvedApplication> {
  readonly applications: readonly TApplication[];
  readonly performance: FormSpecPerformanceRecorder | undefined;
  readonly compilerOptions: ts.CompilerOptions | undefined;
  readonly cache: LruCache<string, MappedBatchDiagnostics>;
  readonly eventPrefix: string;
  readonly missingSourceFileMessage: string;
  readonly fileName: string;
  readonly lowerApplications: (
    applications: readonly TApplication[],
    performance: FormSpecPerformanceRecorder | undefined
  ) => readonly TResolvedApplication[];
  readonly buildBatchSource: (
    applications: readonly TResolvedApplication[],
    performance: FormSpecPerformanceRecorder | undefined
  ) => SyntheticBatchSource;
}

function createEmptySyntheticTagCheckResults(
  applicationCount: number,
  sourceText: string
): readonly SyntheticTagCheckResult[] {
  return Array.from({ length: applicationCount }, () => ({
    sourceText,
    diagnostics: [],
  }));
}

function serializeSyntheticBatchError(error: unknown): SyntheticCompilerDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: isSyntheticSetupError(error)
      ? error.diagnosticKind
      : isUnsupportedCustomTypeOverrideErrorMessage(message)
        ? "unsupported-custom-type-override"
        : "synthetic-setup",
    // Negative codes are reserved for FormSpec-generated synthetic setup errors.
    code: -1,
    message,
  };
}

function runBatchSyntheticCheck<TApplication, TResolvedApplication>(
  options: BatchSyntheticCheckOptions<TApplication, TResolvedApplication>
): SyntheticBatchCheckResult {
  if (options.applications.length === 0) {
    return {
      sourceText: "",
      applicationResults: [],
      globalDiagnostics: [],
    };
  }

  const resolvedApplications = options.lowerApplications(options.applications, options.performance);
  let batchSource: SyntheticBatchSource;
  try {
    batchSource = options.buildBatchSource(resolvedApplications, options.performance);
  } catch (error) {
    const setupDiagnostic = serializeSyntheticBatchError(error);
    // §8.3c — log setup-diagnostic emission at debug level so failures during
    // synthetic-program construction are observable without reading source.
    logSetupDiagnostics(getSyntheticLogger(), {
      diagnosticCount: 1,
      codes: [setupDiagnostic.kind],
    });
    return {
      sourceText: "",
      applicationResults: createEmptySyntheticTagCheckResults(options.applications.length, ""),
      globalDiagnostics: [setupDiagnostic],
    };
  }
  const cacheKey = buildSyntheticBatchCacheKey(batchSource.sourceText, options.compilerOptions);
  const cached = options.cache.get(cacheKey);
  if (cached !== undefined) {
    options.performance?.record({
      name: `${options.eventPrefix}.cacheHit`,
      durationMs: 0,
      detail: {
        applicationCount: options.applications.length,
      },
    });
    return {
      sourceText: batchSource.sourceText,
      applicationResults: cached.applicationResults,
      globalDiagnostics: cached.globalDiagnostics,
    };
  }

  options.performance?.record({
    name: `${options.eventPrefix}.cacheMiss`,
    durationMs: 0,
    detail: {
      applicationCount: options.applications.length,
    },
  });

  const { sourceFile, diagnostics } = runSyntheticProgram(
    options.fileName,
    batchSource.sourceText,
    options.performance,
    options.eventPrefix,
    options.missingSourceFileMessage,
    options.compilerOptions
  );
  const results = optionalMeasure(
    options.performance,
    `${options.eventPrefix}.mapDiagnostics`,
    undefined,
    () => mapBatchDiagnostics(diagnostics, sourceFile, batchSource.applicationLineRanges)
  );
  options.cache.set(cacheKey, results);
  return {
    sourceText: batchSource.sourceText,
    applicationResults: results.applicationResults,
    globalDiagnostics: results.globalDiagnostics,
  };
}

function resolveNarrowSyntheticBatchApplication(
  application: CheckNarrowSyntheticTagApplicabilityOptions
): NarrowSyntheticBatchApplication {
  const definition = getTagDefinition(application.tagName, application.extensions);
  if (definition === null) {
    throw new Error(`Unknown FormSpec tag: ${application.tagName}`);
  }

  const targetKind = application.targetKind ?? null;
  const matchingSignatures = getMatchingTagSignatures(
    definition,
    application.placement,
    targetKind
  );
  if (matchingSignatures.length === 0) {
    throw new Error(
      `No synthetic signature for @${definition.canonicalName} on placement "${application.placement}"` +
        (targetKind === null ? "" : ` with target kind "${targetKind}"`)
    );
  }

  const signature = matchingSignatures[0];
  if (signature === undefined) {
    throw new Error(
      `Invariant violation: missing narrow synthetic signature for @${definition.canonicalName}`
    );
  }

  return {
    definition,
    signature,
    options: application,
  };
}

/**
 * Runs the TypeScript checker once against multiple lowered synthetic tag
 * applications and returns per-application diagnostics.
 */
export function checkSyntheticTagApplicationsDetailed(
  options: CheckSyntheticTagApplicationsOptions
): SyntheticBatchCheckResult {
  return runBatchSyntheticCheck<CheckSyntheticTagApplicationOptions, SyntheticBatchApplication>({
    applications: options.applications,
    performance: options.performance,
    compilerOptions: options.compilerOptions,
    cache: syntheticBatchResultCache,
    eventPrefix: SYNTHETIC_CHECK_EVENT.batch,
    missingSourceFileMessage: "Invariant violation: missing synthetic batch source file",
    fileName: "/virtual/formspec-synthetic-batch.ts",
    lowerApplications: (applications, performance) =>
      optionalMeasure(performance, `${SYNTHETIC_CHECK_EVENT.batch}.lower`, undefined, () =>
        applications.map((application) => ({
          options: application,
          lowered: lowerTagApplicationToSyntheticCall({
            ...application,
            hostType: "__Host",
            subjectType: "__Subject",
          }),
        }))
      ),
    buildBatchSource: (applications, performance) =>
      optionalMeasure(performance, `${SYNTHETIC_CHECK_EVENT.batch}.buildSource`, undefined, () =>
        buildSyntheticBatchSource(applications)
      ),
  });
}

export function checkSyntheticTagApplications(
  options: CheckSyntheticTagApplicationsOptions
): readonly SyntheticTagCheckResult[] {
  const result = checkSyntheticTagApplicationsDetailed(options);
  if (result.globalDiagnostics.length === 0) {
    return result.applicationResults;
  }

  // The legacy batched API has no separate channel for setup-level diagnostics.
  // Merge them into each application result so callers do not lose those errors.
  return result.applicationResults.map((applicationResult) => ({
    sourceText: applicationResult.sourceText,
    diagnostics: [...applicationResult.diagnostics, ...result.globalDiagnostics],
  }));
}

/**
 * Runs the minimal synthetic applicability checker once against multiple
 * already-resolved target types and returns per-application diagnostics.
 */
export function checkNarrowSyntheticTagApplicabilities(
  options: CheckNarrowSyntheticTagApplicabilitiesOptions
): readonly SyntheticTagCheckResult[] {
  return runBatchSyntheticCheck<
    CheckNarrowSyntheticTagApplicabilityOptions,
    NarrowSyntheticBatchApplication
  >({
    applications: options.applications,
    performance: options.performance,
    compilerOptions: options.compilerOptions,
    cache: syntheticBatchResultCache,
    eventPrefix: SYNTHETIC_CHECK_EVENT.narrowBatch,
    missingSourceFileMessage: "Invariant violation: missing narrow synthetic batch source file",
    fileName: "/virtual/formspec-narrow-synthetic-batch.ts",
    lowerApplications: (applications, performance) =>
      optionalMeasure(performance, `${SYNTHETIC_CHECK_EVENT.narrowBatch}.lower`, undefined, () =>
        applications.map(resolveNarrowSyntheticBatchApplication)
      ),
    buildBatchSource: (applications, performance) =>
      optionalMeasure(
        performance,
        `${SYNTHETIC_CHECK_EVENT.narrowBatch}.buildSource`,
        undefined,
        () => buildNarrowSyntheticBatchSource(applications)
      ),
  }).applicationResults;
}

/**
 * Runs the TypeScript checker against a lowered synthetic tag application.
 *
 * This is the compiler-backed validation entrypoint used by FormSpec analysis
 * to verify placement, target binding, and argument compatibility without
 * requiring comment tags themselves to be valid TypeScript syntax.
 */
export function checkSyntheticTagApplication(
  options: CheckSyntheticTagApplicationOptions
): SyntheticTagCheckResult {
  const batchResult = checkSyntheticTagApplicationsDetailed({
    applications: [options],
    ...(options.performance === undefined ? {} : { performance: options.performance }),
    ...(options.compilerOptions === undefined ? {} : { compilerOptions: options.compilerOptions }),
  });
  const result = batchResult.applicationResults[0];
  if (result === undefined) {
    throw new Error("Invariant violation: missing synthetic batch result for singular check");
  }
  if (batchResult.globalDiagnostics.length === 0) {
    return result;
  }
  return {
    sourceText: result.sourceText,
    diagnostics: [...result.diagnostics, ...batchResult.globalDiagnostics],
  };
}

/**
 * Runs a minimal synthetic applicability check against an already-resolved
 * target type. This avoids reproducing path/member resolution in the synthetic
 * program and isolates only the type-compatibility question.
 */
export function checkNarrowSyntheticTagApplicability(
  options: CheckNarrowSyntheticTagApplicabilityOptions
): SyntheticTagCheckResult {
  const result = checkNarrowSyntheticTagApplicabilities({
    applications: [options],
    ...(options.performance === undefined ? {} : { performance: options.performance }),
  })[0];
  if (result === undefined) {
    throw new Error(
      "Invariant violation: missing narrow synthetic batch result for singular check"
    );
  }
  return result;
}
