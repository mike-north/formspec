/**
 * Extension setup validation + placement-signature matching.
 *
 * §5 Phase 5C — this module formerly hosted the synthetic-TypeScript-program
 * batch used by both the build and snapshot consumers for Role-D type-check
 * validation. The synthetic program has been retired:
 * constraint-tag validation now flows through `getMatchingTagSignatures`
 * (Role A — placement pre-check),
 * `_supportsConstraintCapability`/`resolvePathTargetType` (Role B —
 * capability guard), and `parseTagArgument` (Role C — typed-parser argument
 * validation) in both consumers.
 *
 * The remaining exports are:
 *
 * - `getMatchingTagSignatures` — placement + target-kind overload filter used
 *   by both consumers' Role-A pre-check.
 * - `_validateExtensionSetup` — non-throwing validation of extension
 *   custom-type-name registrations. Produces
 *   `SYNTHETIC_SETUP_FAILURE` / `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE`
 *   diagnostics at registry construction time.
 * - `_emitSetupDiagnostics` — maps validation output into
 *   `ConstraintSemanticDiagnostic[]` anchored at the extension registry.
 * - `_mapSetupDiagnosticCode` — kind → diagnostic-code mapping shared between
 *   the build and snapshot consumers.
 * - Supporting types: `SyntheticCompilerDiagnostic` (shape preserved for
 *   backward compatibility of the setup-diagnostic pipeline).
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5C
 */

import type { Provenance } from "@formspec/core/internals";
import { type ConstraintSemanticDiagnostic } from "./semantic-targets.js";
import {
  type ExtensionTagSource,
  type FormSpecPlacement,
  type TagDefinition,
  type TagSignature,
  type TagSignatureParameter,
} from "./tag-registry.js";

/**
 * Target kinds surfaced by `getMatchingTagSignatures`.
 *
 * A missing target is modeled by passing `null` rather than a dedicated
 * `"none"` variant.
 */
export type SyntheticTagTargetKind = "path" | "member" | "variant";

/**
 * Setup-time diagnostic produced by the `_validateExtensionSetup` helper in
 * this module.
 *
 * The `kind` field distinguishes between a "setup" failure (invalid type
 * name, duplicate registration) and an unsupported built-in override.
 * Historically this shape also carried raw TypeScript diagnostics from the
 * synthetic program (`kind: "typescript"`); that variant is retained to keep
 * the `_mapSetupDiagnosticCode` switch exhaustive even though no caller
 * produces it any more.
 *
 * @internal
 */
export interface SyntheticCompilerDiagnostic {
  /** The category of diagnostic. */
  readonly kind: "typescript" | "unsupported-custom-type-override" | "synthetic-setup";
  /** TypeScript diagnostic code, or -1 for non-TypeScript diagnostics. */
  readonly code: number;
  /** Human-readable description of the diagnostic. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Signature target-kind helpers (used by getMatchingTagSignatures)
// ---------------------------------------------------------------------------

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

/**
 * Filters a tag definition's overloads down to the ones that apply to the
 * requested placement and target form.
 *
 * Used as the Role-A placement pre-check in both the build and snapshot
 * consumers. An empty result means the tag is not allowed on the requested
 * placement/target combination — callers emit `INVALID_TAG_PLACEMENT`.
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

// ---------------------------------------------------------------------------
// Extension setup validation
// ---------------------------------------------------------------------------

/**
 * TypeScript primitive type keywords. Registering these as `tsTypeNames` is
 * valid and carries no declaration cost — TS resolves them natively.
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
 * TypeScript global built-in type names. The boolean indicates whether
 * FormSpec currently supports overriding that name with a custom type
 * registration.
 *
 * To promote a type from unsupported to supported, flip its value to `true`.
 */
const TS_GLOBAL_BUILTIN_TYPES = new Map<string, boolean>([
  ["Date", true], // ISO 8601 datetime — { type: "string", format: "date-time" }
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
 * Maps a `SyntheticCompilerDiagnostic["kind"]` to its canonical diagnostic
 * code string.
 *
 * Shared between the build and snapshot consumers to avoid diverging ternary
 * chains. The `"typescript"` branch is retained for historical shape
 * compatibility even though no caller produces that kind any more.
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
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Validates extension custom-type registrations.
 *
 * Produces setup diagnostics without throwing. Called once at registry
 * construction time by `createExtensionRegistry` so setup diagnostics are
 * emitted ONCE per registry rather than once per analysis call.
 *
 * Skips `TS_PRIMITIVE_KEYWORDS` (natively resolved) and `TS_GLOBAL_BUILTIN_TYPES`
 * with value `true` (supported overrides). Rejects malformed names, duplicates
 * across/within extensions, and unsupported global-built-in overrides.
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
  const seen = new Map<string, string>(); // tsName -> extensionId
  for (const ext of extensions) {
    for (const customType of ext.customTypes ?? []) {
      for (const tsName of customType.tsTypeNames) {
        if (TS_PRIMITIVE_KEYWORDS.has(tsName)) {
          continue;
        }
        const globalBuiltinSupported = TS_GLOBAL_BUILTIN_TYPES.get(tsName);
        if (globalBuiltinSupported === true) {
          continue;
        }
        if (globalBuiltinSupported === false) {
          diagnostics.push({
            kind: "unsupported-custom-type-override",
            code: -1,
            message:
              `Custom type name "${tsName}" registered by extension "${ext.extensionId}" ` +
              `conflicts with a TypeScript global built-in type that FormSpec does not ` +
              `yet support overriding. Rename the custom type to a non-conflicting name.`,
          });
          continue;
        }
        if (!/^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(tsName)) {
          diagnostics.push({
            kind: "synthetic-setup",
            code: -1,
            message:
              `Invalid custom type name "${tsName}" registered by extension "${ext.extensionId}": ` +
              `must be a valid TypeScript identifier.`,
          });
          continue;
        }
        const existingExtensionId = seen.get(tsName);
        if (existingExtensionId !== undefined) {
          diagnostics.push({
            kind: "synthetic-setup",
            code: -1,
            message:
              `Duplicate custom type name "${tsName}" registered by extensions ` +
              `"${existingExtensionId}" and "${ext.extensionId}". ` +
              `Extension-registered types must have unique names.`,
          });
          continue;
        }
        seen.set(tsName, ext.extensionId);
      }
    }
  }
  return diagnostics;
}

/**
 * Provenance anchor for extension setup diagnostics.
 *
 * Setup failures are detected at registry construction time, before any
 * source file is analyzed. `line: 1, column: 0` is the conventional
 * registry-level anchor; `surface: "extension"` distinguishes these from
 * tag-site diagnostics.
 */
function _extensionRegistryProvenance(file: string): Provenance {
  return { surface: "extension", file, line: 1, column: 0 };
}

/**
 * Converts `registry.setupDiagnostics` into `ConstraintSemanticDiagnostic[]`
 * anchored at the extension-registration site for the given file.
 *
 * Single source of truth for the build path's pre-emit of setup diagnostics
 * (consumed by `parseTSDocTags`).
 *
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
