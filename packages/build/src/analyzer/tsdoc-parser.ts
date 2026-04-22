/**
 * TSDoc-based structured tag parser.
 *
 * Bridges the TypeScript compiler AST with the official `@microsoft/tsdoc`
 * parser to extract constraint and annotation tags from JSDoc comments
 * on class/interface/type-alias properties.
 *
 * The parser recognises two categories of tags:
 *
 * 1. **Constraint tags** (all alphanumeric, TSDoc-compliant):
 *    `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`,
 *    `@multipleOf`, `@minLength`, `@maxLength`, `@minItems`, `@maxItems`,
 *    `@uniqueItems`, `@pattern`, `@enumOptions`, `@const`
 *    — Parsed via TSDocParser as custom block tags.
 *    Both camelCase and PascalCase forms are accepted (e.g., `@Minimum`).
 *
 * 2. **Metadata and annotation tags** (`@apiName`, `@displayName`,
 *    `@format`, `@placeholder`):
 *    These are parsed as structured custom block tags so summary extraction
 *    stops at recognized FormSpec tags. `@displayName`, `@format`, and
 *    `@placeholder` also map onto annotation IR nodes, while `@apiName`
 *    remains metadata-only and is resolved separately by the class analyzer.
 *
 * The `@deprecated` tag is a standard TSDoc block tag, parsed structurally.
 *
 * Description and remarks extraction (spec 002 §2.3):
 * - Summary text (bare text before the first block tag) → `description` annotation
 * - `@remarks` block → `remarks` annotation (separate channel)
 * - `@description` is NOT supported (not a standard TSDoc tag)
 *
 * **Fallback strategy**: TSDoc treats `{` / `}` as inline tag delimiters and
 * `@` as a tag prefix, so content containing these characters (e.g. JSON
 * objects in `@EnumOptions`, regex patterns with `@` in `@Pattern`) gets
 * mangled by the TSDoc parser. The shared comment syntax parser is the
 * primary source for these payloads; the TS compiler's `ts.getJSDocTags()`
 * API remains as a fallback when a raw payload cannot be recovered from the
 * shared parse.
 */

import * as ts from "typescript";
import {
  _capabilityLabel,
  _supportsConstraintCapability,
  choosePreferredPayloadText,
  extractPathTarget as extractSharedPathTarget,
  getBroadenedCustomTypeId,
  getTagDefinition,
  hasTypeSemanticCapability,
  normalizeFormSpecTagName,
  stripNullishUnion,
  parseConstraintTagValue,
  parseDefaultValueTagValue,
  parseTagSyntax,
  parseUnifiedComment,
  resolveDeclarationPlacement,
  resolvePathTargetType,
  TAGS_REQUIRING_RAW_TEXT,
  type ConstraintSemanticDiagnostic,
  type ParsedCommentTag,
  type SemanticCapability,
} from "@formspec/analysis/internal";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
  isBuiltinConstraintName,
} from "@formspec/core/internals";
import {
  type ConstraintNode,
  type AnnotationNode,
  type Provenance,
  type PathTarget,
  type TypeNode,
} from "@formspec/core/internals";
import { noopLogger } from "@formspec/core";
import type { ExtensionRegistry } from "../extensions/index.js";
import {
  customTypeIdFromLookup,
  resolveCustomTypeFromTsType,
} from "../extensions/resolve-custom-type.js";
import { _isIntegerBrandedType } from "./builtin-brands.js";
import {
  _emitSetupDiagnostics,
  getBuildLogger,
  getBroadeningLogger,
  getTypedParserLogger,
  extractEffectiveArgumentText,
  mapTypedParserDiagnosticCode,
  parseTagArgument,
  describeTypeKind,
  elapsedMicros,
  nowMicros,
  logTagApplication,
  type ConstraintValidatorRoleOutcome,
} from "@formspec/analysis/internal";

function sharedTagValueOptions(options?: ParseTSDocOptions, pathResolvedCustomTypeId?: string) {
  return {
    ...(options?.extensionRegistry !== undefined ? { registry: options.extensionRegistry } : {}),
    ...(options?.fieldType !== undefined ? { fieldType: options.fieldType } : {}),
    ...(pathResolvedCustomTypeId !== undefined ? { pathResolvedCustomTypeId } : {}),
  };
}

/**
 * For a `ts.Type` already resolved (e.g. by walking a path through the host),
 * returns the fully-qualified custom type ID if the type is a registered
 * custom type, else `undefined`. Single shared step used both for direct-type
 * lookups and for path-resolved terminals.
 */
function customTypeIdForResolvedType(
  resolvedType: ts.Type,
  checker: ts.TypeChecker,
  registry: ExtensionRegistry | undefined
): string | undefined {
  if (registry === undefined) return undefined;
  const lookup = resolveCustomTypeFromTsType(resolvedType, checker, registry);
  return lookup === null ? undefined : customTypeIdFromLookup(lookup);
}

/**
 * For a parsed tag whose target is a valid path (`:foo.bar`), resolves the
 * terminal sub-type through the TypeScript compiler and looks up whether that
 * sub-type is a registered custom type. Returns the fully-qualified type ID
 * (`extensionId/typeName`) used by the broadening registry, or `undefined`
 * when any precondition is missing or the terminal type is not a registered
 * custom type.
 *
 * This is the build-consumer-only hook that enables path-targeted broadening
 * in the analysis layer; the resolved ID is threaded to
 * `parseConstraintTagValue` via its `pathResolvedCustomTypeId` option.
 */
function resolvePathTargetCustomTypeId(
  parsedTag: ParsedCommentTag | null,
  subjectType: ts.Type | undefined,
  checker: ts.TypeChecker | undefined,
  registry: ExtensionRegistry | undefined
): string | undefined {
  if (parsedTag === null) return undefined;
  const target = parsedTag.target;
  if (target?.kind !== "path" || !target.valid || target.path === null) {
    return undefined;
  }
  if (subjectType === undefined || checker === undefined) {
    return undefined;
  }

  const resolution = resolvePathTargetType(subjectType, checker, target.path.segments);
  if (resolution.kind !== "resolved") {
    return undefined;
  }

  return customTypeIdForResolvedType(resolution.type, checker, registry);
}

const TYPE_FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

/**
 * Runs the full constraint tag processing pipeline for a single tag: compiler
 * diagnostics check → constraint value parse → push to output arrays.
 *
 * If compiler diagnostics are found the constraint is skipped and diagnostics
 * are accumulated instead. Returns without mutating outputs if the tag produces
 * no usable constraint node.
 */
function processConstraintTag(
  tagName: string,
  text: string,
  parsedTag: ParsedCommentTag | null,
  provenance: Provenance,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  options: ParseTSDocOptions | undefined,
  constraints: ConstraintNode[],
  diagnostics: ConstraintSemanticDiagnostic[]
): void {
  const compilerDiagnostics = buildCompilerBackedConstraintDiagnostics(
    node,
    sourceFile,
    tagName,
    parsedTag,
    text,
    provenance,
    options
  );
  if (compilerDiagnostics.length > 0) {
    // §4 Phase 5C — synthetic-batch dedup no longer needed: the synthetic setup
    // diagnostics (UNSUPPORTED_CUSTOM_TYPE_OVERRIDE / SYNTHETIC_SETUP_FAILURE)
    // are emitted once at registry setup time via _emitSetupDiagnostics and can
    // no longer reach this site because the synthetic batch call has been deleted.
    diagnostics.push(...compilerDiagnostics);
    return;
  }
  // Resolve the path-targeted custom type ID (if any) so the analysis layer
  // can apply broadening to the path-resolved terminal type — fixes #395
  // where path-targeted built-in constraints (e.g. `@exclusiveMinimum :amount 0`
  // on a `MonetaryAmount` field) previously emitted raw numeric constraints.
  const pathResolvedCustomTypeId = resolvePathTargetCustomTypeId(
    parsedTag,
    options?.subjectType,
    options?.checker,
    options?.extensionRegistry
  );
  const constraintNode = parseConstraintTagValue(
    tagName,
    text,
    provenance,
    sharedTagValueOptions(options, pathResolvedCustomTypeId)
  );
  if (constraintNode) {
    constraints.push(constraintNode);
  }
}

/**
 * Re-export shim: the implementation has moved to
 * `@formspec/analysis/internal:_supportsConstraintCapability`.
 *
 * The local signature `(type, checker, capability)` is preserved so existing
 * callers in this file do not need to change argument order.
 */
function supportsConstraintCapability(
  type: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability | undefined
): boolean {
  return _supportsConstraintCapability(capability, type, checker);
}

const MAX_HINT_CANDIDATES = 5;
const MAX_HINT_DEPTH = 3;

function stripHintNullishUnion(type: ts.Type): ts.Type {
  if (!type.isUnion()) {
    return type;
  }
  const nonNullish = type.types.filter(
    (member) => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0
  );
  if (nonNullish.length === 1 && nonNullish[0] !== undefined) {
    return nonNullish[0];
  }
  return type;
}

function isCallableType(type: ts.Type): boolean {
  return type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0;
}

function isUserEmittableHintProperty(property: ts.Symbol, declaration: ts.Declaration): boolean {
  if (property.name.startsWith("__")) {
    return false;
  }
  if ("name" in declaration && declaration.name !== undefined) {
    const name = declaration.name as ts.PropertyName;
    if (ts.isComputedPropertyName(name) || ts.isPrivateIdentifier(name)) {
      return false;
    }
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) {
      return false;
    }
  }
  return true;
}

/**
 * Collects user-declared subfields whose type satisfies the constraint
 * `capability`. Only descends into object-like types — never traverses into
 * primitives' intrinsic properties (e.g. would not surface `string.length`
 * on a `string` subfield), into function/call-signature types (which would
 * surface `Function.prototype` members like `length`, `name`, `apply`), or
 * through synthetic property names like `__brand` / computed / private ones.
 * Nullish unions are stripped so `Foo | null` can still surface candidates
 * declared on `Foo`. Terminal matches use `supportsConstraintCapability` so
 * the hint aligns with the capability rules used by the TYPE_MISMATCH
 * diagnostic (for example, `string[]` satisfies `string-like`).
 */
function collectObjectSubfieldCandidates(
  type: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability
): readonly string[] {
  const out: string[] = [];
  const visit = (current: ts.Type, prefix: readonly string[], depth: number): void => {
    if (depth > MAX_HINT_DEPTH) {
      return;
    }
    const stripped = stripHintNullishUnion(current);
    if (isCallableType(stripped)) {
      return;
    }
    if (!hasTypeSemanticCapability(stripped, checker, "object-like")) {
      return;
    }
    for (const property of stripped.getProperties()) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (declaration === undefined) {
        continue;
      }
      if (!isUserEmittableHintProperty(property, declaration)) {
        continue;
      }
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
      const path = [...prefix, property.name];
      if (supportsConstraintCapability(propertyType, checker, capability)) {
        out.push(path.join("."));
        continue;
      }
      const strippedPropertyType = stripHintNullishUnion(propertyType);
      if (
        !isCallableType(strippedPropertyType) &&
        hasTypeSemanticCapability(strippedPropertyType, checker, "object-like")
      ) {
        visit(strippedPropertyType, path, depth + 1);
      }
    }
  };
  visit(type, [], 0);
  return out;
}

function buildPathTargetHint(
  subjectType: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability,
  tagName: string,
  argumentText: string | undefined
): string | null {
  // Only suggest path targeting when the subject is itself an object — for
  // primitive mismatches (e.g. `@minimum` on a `string`), the user almost
  // certainly meant a different constraint, not a path target.
  if (!hasTypeSemanticCapability(subjectType, checker, "object-like")) {
    return null;
  }

  const candidates = collectObjectSubfieldCandidates(subjectType, checker, capability);
  const primary = candidates[0];
  if (primary === undefined) {
    return null;
  }

  const argText = argumentText?.trim() ?? "";
  const renderExample = (path: string): string =>
    argText === "" ? `@${tagName} :${path}` : `@${tagName} :${path} ${argText}`;

  if (candidates.length === 1) {
    return `Hint: use a path target to constrain a subfield, e.g. ${renderExample(primary)}`;
  }

  const shown = candidates.slice(0, MAX_HINT_CANDIDATES);
  const overflow = candidates.length > MAX_HINT_CANDIDATES ? ", …" : "";
  return `Hint: use a path target to constrain a subfield (candidates: ${shown.join(", ")}${overflow}), e.g. ${renderExample(primary)}`;
}

function makeDiagnostic(
  code: string,
  message: string,
  provenance: Provenance
): ConstraintSemanticDiagnostic {
  return {
    code,
    message,
    severity: "error",
    primaryLocation: provenance,
    relatedLocations: [],
  };
}

function placementLabel(
  placement: NonNullable<ReturnType<typeof resolveDeclarationPlacement>>
): string {
  switch (placement) {
    case "class":
      return "class declarations";
    case "class-field":
      return "class fields";
    case "class-method":
      return "class methods";
    case "interface":
      return "interface declarations";
    case "interface-field":
      return "interface fields";
    case "type-alias":
      return "type aliases";
    case "type-alias-field":
      return "type-alias properties";
    case "variable":
      return "variables";
    case "function":
      return "functions";
    case "function-parameter":
      return "function parameters";
    case "method-parameter":
      return "method parameters";
    default: {
      const exhaustive: never = placement;
      return String(exhaustive);
    }
  }
}


function hasBuiltinConstraintBroadening(tagName: string, options?: ParseTSDocOptions): boolean {
  const broadenedTypeId = getBroadenedCustomTypeId(options?.fieldType);
  return (
    broadenedTypeId !== undefined &&
    options?.extensionRegistry?.findBuiltinConstraintBroadening(broadenedTypeId, tagName) !==
      undefined
  );
}

function buildCompilerBackedConstraintDiagnostics(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tagName: string,
  parsedTag: ParsedCommentTag | null,
  rawText: string,
  provenance: Provenance,
  options?: ParseTSDocOptions
): readonly ConstraintSemanticDiagnostic[] {
  if (!isBuiltinConstraintName(tagName)) {
    return [];
  }

  const checker = options?.checker;
  const subjectType = options?.subjectType;
  if (checker === undefined || subjectType === undefined) {
    return [];
  }

  const placement = resolveDeclarationPlacement(node);
  if (placement === null) {
    return [];
  }

  const definition = getTagDefinition(tagName, options?.extensionRegistry?.extensions);
  if (definition === null) {
    return [];
  }

  // §8.3b — gather structured-log context only when logging is enabled.
  // `placement` is narrowed to non-null above; capture it in a typed constant
  // so TypeScript can see the narrowed type inside the `emit` closure below.
  const nonNullPlacement: NonNullable<ReturnType<typeof resolveDeclarationPlacement>> = placement;
  const log = getBuildLogger();
  const broadeningLog = getBroadeningLogger();
  const typedParserLog = getTypedParserLogger();
  const logsEnabled = log !== noopLogger || broadeningLog !== noopLogger;
  const typedParserTraceEnabled = typedParserLog !== noopLogger;
  const logStart = logsEnabled ? nowMicros() : 0;
  const subjectTypeKind = logsEnabled ? describeTypeKind(subjectType, checker) : "";

  /**
   * Emits the §8.3b structured log entry and returns the supplied diagnostic
   * array unchanged. All early returns in this function go through this helper.
   *
   * Broadening-bypass outcomes are additionally emitted on the `:broadening`
   * sub-namespace so they are separately filterable.
   */
  function emit(
    outcome: ConstraintValidatorRoleOutcome,
    result: readonly ConstraintSemanticDiagnostic[]
  ): readonly ConstraintSemanticDiagnostic[] {
    if (!logsEnabled) {
      return result;
    }
    const entry = {
      consumer: "build" as const,
      tag: tagName,
      placement: nonNullPlacement,
      subjectTypeKind,
      roleOutcome: outcome,
      elapsedMicros: elapsedMicros(logStart),
    };
    logTagApplication(log, entry);
    if (outcome === "bypass" || outcome === "D1" || outcome === "D2") {
      logTagApplication(broadeningLog, entry);
    }
    return result;
  }

  if (!definition.placements.includes(placement)) {
    return emit("A-reject", [
      makeDiagnostic(
        "INVALID_TAG_PLACEMENT",
        `Tag "@${tagName}" is not allowed on ${placementLabel(placement)}.`,
        provenance
      ),
    ]);
  }

  const target = parsedTag?.target ?? null;

  // Resolve the type the capability check should run against: the path-target
  // destination for `:foo` constraints, otherwise the field's own type.
  let evaluatedType: ts.Type = subjectType;
  let targetLabel = node.getText(sourceFile);
  if (target !== null) {
    if (target.kind !== "path") {
      return emit("B-reject", [
        makeDiagnostic(
          "UNSUPPORTED_TARGETING_SYNTAX",
          `Tag "@${tagName}" does not support ${target.kind} targeting syntax.`,
          provenance
        ),
      ]);
    }

    if (!target.valid || target.path === null) {
      return emit("B-reject", [
        makeDiagnostic(
          "UNSUPPORTED_TARGETING_SYNTAX",
          `Tag "@${tagName}" has invalid path targeting syntax.`,
          provenance
        ),
      ]);
    }

    const resolution = resolvePathTargetType(subjectType, checker, target.path.segments);
    if (resolution.kind === "missing-property") {
      return emit("B-reject", [
        makeDiagnostic(
          "UNKNOWN_PATH_TARGET",
          `Target "${target.rawText}": path-targeted constraint "${tagName}" references unknown path segment "${resolution.segment}"`,
          provenance
        ),
      ]);
    }

    if (resolution.kind === "unresolvable") {
      const actualType = checker.typeToString(resolution.type, node, TYPE_FORMAT_FLAGS);
      return emit("B-reject", [
        makeDiagnostic(
          "TYPE_MISMATCH",
          `Target "${target.rawText}": path-targeted constraint "${tagName}" is invalid because type "${actualType}" cannot be traversed`,
          provenance
        ),
      ]);
    }

    evaluatedType = resolution.type;
    targetLabel = target.rawText;
  }

  // Unified broadening check:
  //  - Direct field (`target === null`): uses the IR-layer `FieldType`
  //    carried on `options.fieldType`. This is the pre-existing path.
  //  - Path target (`target !== null`): no IR is available for the
  //    path-resolved sub-type, so resolve the custom type from the raw
  //    `ts.Type` via the shared extension-registry resolver and look up
  //    broadening by `(customTypeId, tagName)`.
  //
  // Both variants answer the same question — "is `tagName` broadened onto
  // the type we're about to validate?" — and short-circuit the capability
  // check below in favour of the IR-layer validator which understands
  // extension-defined constraint semantics.
  const hasBroadening = ((): boolean => {
    if (target === null) {
      if (
        _isIntegerBrandedType(stripNullishUnion(subjectType)) &&
        definition.capabilities[0] === "numeric-comparable"
      ) {
        return true;
      }
      return hasBuiltinConstraintBroadening(tagName, options);
    }
    const registry = options?.extensionRegistry;
    if (registry === undefined) return false;
    const typeId = customTypeIdForResolvedType(evaluatedType, checker, registry);
    return (
      typeId !== undefined &&
      registry.findBuiltinConstraintBroadening(typeId, tagName) !== undefined
    );
  })();

  if (!hasBroadening) {
    const requiredCapability = definition.capabilities[0];
    if (
      requiredCapability !== undefined &&
      !supportsConstraintCapability(evaluatedType, checker, requiredCapability)
    ) {
      const actualType = checker.typeToString(evaluatedType, node, TYPE_FORMAT_FLAGS);
      const baseMessage = `Target "${targetLabel}": constraint "${tagName}" is only valid on ${_capabilityLabel(requiredCapability)} targets, but field type is "${actualType}"`;
      // Path-target hints only apply to direct-field mismatches — the hint
      // suggests "did you mean a sub-path?" which is nonsensical when the
      // user is already path-targeting.
      const hint =
        target === null
          ? buildPathTargetHint(
              subjectType,
              checker,
              requiredCapability,
              tagName,
              parsedTag?.argumentText
            )
          : null;
      return emit("B-reject", [
        makeDiagnostic(
          "TYPE_MISMATCH",
          hint === null ? baseMessage : `${baseMessage}. ${hint}`,
          provenance
        ),
      ]);
    }
  }

  // Role C: validate argument literal via the typed parser. The typed parser is
  // the gatekeeper for argument-shape validity (is `10.5` a valid `@minLength`
  // arg? is `[]` a valid `@enumOptions` arg?). Roles A and B have already run
  // above; this guard handles Role C.
  //
  // IMPORTANT: the typed-parser call is guarded by `if (!hasBroadening)` so that
  // broadened fields (D1/D2) bypass Role C entirely. Without this guard a broadened
  // field whose argument the typed parser would reject (e.g. a non-JSON @enumOptions
  // arg on a Decimal path-target) would spuriously emit INVALID_TAG_ARGUMENT instead
  // of being silently bypassed as Role D1/D2 requires.
  //
  // Behaviour (non-broadened path):
  //   - ok: false → emit C-reject with the typed parser's code + message.
  //   - ok: true (including raw-string-fallback for @const) → proceed.
  //     The raw-string-fallback is a successful parse; the downstream IR compatibility
  //     check (semantic-targets.ts:~1255-1298) owns the final decision for @const.
  if (hasBroadening) {
    return emit("bypass", []);
  }

  // §4 Phase 4B — use shared extractEffectiveArgumentText so both consumers
  // derive argument text identically. Extracts the argument from rawText (the
  // canonical post-choosePreferredPayloadText string), which for
  // TAGS_REQUIRING_RAW_TEXT may have been selected via the compiler-API
  // fallback. Re-parsing from rawText applies path-target prefix stripping and
  // canonicalisation consistently with the snapshot consumer.
  // Computed after the bypass check so broadened fields skip this work entirely.
  const effectiveArgumentText = extractEffectiveArgumentText(tagName, rawText, parsedTag);

  const typedParseResult = parseTagArgument(tagName, effectiveArgumentText, "build");

  if (!typedParseResult.ok) {
    // §8.3 — emit typed-parser trace log when enabled.
    if (typedParserTraceEnabled) {
      typedParserLog.trace("typed-parser C-reject", {
        consumer: "build",
        tag: tagName,
        placement: nonNullPlacement,
        subjectTypeKind: subjectTypeKind !== "" ? subjectTypeKind : "-",
        roleOutcome: "C-reject",
        diagnosticCode: typedParseResult.diagnostic.code,
      });
    }
    // Map the typed-parser diagnostic code to a ConstraintSemanticDiagnostic code.
    // UNKNOWN_TAG is structurally unreachable here: parseTagArgument is only called
    // after the tag was resolved via getTagDefinition above. If it fires, it's a bug.
    // mapTypedParserDiagnosticCode provides an exhaustive switch shared with the
    // snapshot consumer — avoids the Lesson 3 silent-ternary-collapse pitfall.
    const mappedCode = mapTypedParserDiagnosticCode(typedParseResult.diagnostic.code, tagName);
    return emit("C-reject", [
      makeDiagnostic(mappedCode, typedParseResult.diagnostic.message, provenance),
    ]);
  }

  // §4 Phase 5C — typed parser accepted the argument. This is the terminal
  // success outcome: all constraint-tag validation (placement Role A, path-target
  // resolution, capability Role B, argument Role C) has now passed via the
  // typed-parser/capability checks above. Previously this site invoked the
  // synthetic TypeScript program for a redundant "Role D" re-check; that
  // machinery has been deleted (synthetic-checker retirement §4 Phase 5C).
  if (typedParserTraceEnabled) {
    typedParserLog.trace("typed-parser C-pass", {
      consumer: "build",
      tag: tagName,
      placement: nonNullPlacement,
      subjectTypeKind: subjectTypeKind !== "" ? subjectTypeKind : "-",
      roleOutcome: "C-pass",
      valueKind: typedParseResult.value.kind,
    });
  }

  return emit("C-pass", []);
}

const parseResultCache = new Map<string, TSDocParseResult>();

function getExtensionTagNames(options?: ParseTSDocOptions): readonly string[] {
  return [
    ...(options?.extensionRegistry?.extensions.flatMap((extension) =>
      (extension.constraintTags ?? []).map((tag) => normalizeFormSpecTagName(tag.tagName))
    ) ?? []),
    ...(options?.extensionRegistry?.extensions.flatMap((extension) =>
      (extension.metadataSlots ?? []).map((slot) => normalizeFormSpecTagName(slot.tagName))
    ) ?? []),
  ].sort();
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Result of parsing a single JSDoc comment attached to a TS AST node.
 */
export interface TSDocParseResult {
  /** Constraint IR nodes extracted from custom block tags. */
  readonly constraints: readonly ConstraintNode[];
  /** Annotation IR nodes extracted from canonical TSDoc block tags. */
  readonly annotations: readonly AnnotationNode[];
  /** Compiler-backed extraction diagnostics for invalid tag applications. */
  readonly diagnostics: readonly ConstraintSemanticDiagnostic[];
}

/**
 * Optional extension-aware parsing inputs for TSDoc extraction.
 */
export interface ParseTSDocOptions {
  /**
   * Extension registry used to resolve custom tags and custom-type-specific
   * broadening of built-in constraint tags.
   */
  readonly extensionRegistry?: ExtensionRegistry;
  /**
   * Effective field/type node for the declaration being parsed. Required when
   * built-in tags may broaden onto a custom type.
   */
  readonly fieldType?: TypeNode;
  /** Type checker used for compiler-backed placement and type validation. */
  readonly checker?: ts.TypeChecker;
  /** The declaration type that the parsed tag applies to. */
  readonly subjectType?: ts.Type;
  /** Optional enclosing host type for future cross-field signature checks. */
  readonly hostType?: ts.Type;
}

/**
 * Display-name metadata extracted from a node's JSDoc tags.
 *
 * The root display name is returned separately from member-target labels so
 * callers can apply the former to the enclosing type/form and the latter to
 * enum members.
 */
export interface DisplayNameMetadata {
  readonly displayName?: string;
  readonly memberDisplayNames: ReadonlyMap<string, string>;
}

function getExtensionRegistryCacheKey(registry: ExtensionRegistry | undefined): string {
  if (registry === undefined) {
    return "";
  }

  return registry.extensions
    .map((extension) =>
      JSON.stringify({
        extensionId: extension.extensionId,
        typeNames: extension.types?.map((type) => type.typeName) ?? [],
        constraintTags:
          extension.constraintTags?.map((tag) => normalizeFormSpecTagName(tag.tagName)) ?? [],
        metadataSlots:
          extension.metadataSlots?.map((slot) => ({
            tagName: normalizeFormSpecTagName(slot.tagName),
            declarationKinds: [...slot.declarationKinds].sort(),
            allowBare: slot.allowBare !== false,
            qualifiers: (slot.qualifiers ?? [])
              .map((qualifier) => ({
                qualifier: qualifier.qualifier,
                ...(qualifier.sourceQualifier !== undefined
                  ? { sourceQualifier: qualifier.sourceQualifier }
                  : {}),
              }))
              .sort((left, right) => left.qualifier.localeCompare(right.qualifier)),
          })) ?? [],
      })
    )
    .join("|");
}

function getParseCacheKey(
  node: ts.Node,
  file: string,
  options: ParseTSDocOptions | undefined
): string {
  const sourceFile = node.getSourceFile();
  const checker = options?.checker;
  return JSON.stringify({
    file,
    sourceFile: sourceFile.fileName,
    sourceText: sourceFile.text,
    start: node.getFullStart(),
    end: node.getEnd(),
    fieldType: options?.fieldType ?? null,
    subjectType:
      checker !== undefined && options?.subjectType !== undefined
        ? checker.typeToString(options.subjectType, node, TYPE_FORMAT_FLAGS)
        : null,
    hostType:
      checker !== undefined && options?.hostType !== undefined
        ? checker.typeToString(options.hostType, node, TYPE_FORMAT_FLAGS)
        : null,
    extensions: getExtensionRegistryCacheKey(options?.extensionRegistry),
  });
}

/**
 * Parses the JSDoc comment attached to a TypeScript AST node using the
 * unified comment parser and returns canonical IR constraint and annotation
 * nodes.
 *
 * For constraint tags (`@minimum`, `@pattern`, `@enumOptions`, etc.),
 * the unified parser provides aligned span and TSDoc block information.
 * Canonical annotation tags (`@displayName`) are also parsed structurally.
 * Summary text and `@remarks` are extracted as separate annotation nodes.
 *
 * @param node - The TS AST node to inspect (PropertyDeclaration, PropertySignature, etc.)
 * @param file - Absolute source file path for provenance
 * @returns Parsed constraint and annotation nodes
 */
export function parseTSDocTags(
  node: ts.Node,
  file = "",
  options?: ParseTSDocOptions
): TSDocParseResult {
  const cacheKey = getParseCacheKey(node, file, options);
  const cached = parseResultCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // §4 Phase 4 Slice C — when the registry has setup failures, emit them ONCE
  // per parseTSDocTags call (anchored at the extension registration site) and
  // skip all further tag parsing for this node.
  //
  // Rationale for the early-return: an invalid registry means constraint types
  // cannot be resolved, so placement validation and summary-text extraction
  // for every field in the class would be based on incomplete type information.
  // Surfacing only the setup diagnostic — rather than potentially spurious
  // placement errors — keeps the user's feedback loop focused on fixing the
  // broken extension configuration first. See test
  // "parseTSDocTags silent-drop: only setup diagnostics surface when registry
  // has setup failures" in tsdoc-parser-setup-diagnostic-silent-drop.test.ts.
  const setupDiags = options?.extensionRegistry?.setupDiagnostics;
  if (setupDiags !== undefined && setupDiags.length > 0) {
    const result: TSDocParseResult = {
      constraints: [],
      annotations: [],
      diagnostics: _emitSetupDiagnostics(setupDiags, file),
    };
    parseResultCache.set(cacheKey, result);
    return result;
  }

  const constraints: ConstraintNode[] = [];
  const annotations: AnnotationNode[] = [];
  const diagnostics: ConstraintSemanticDiagnostic[] = [];
  let displayName: string | undefined;
  let placeholder: string | undefined;
  let displayNameProvenance: Provenance | undefined;
  let placeholderProvenance: Provenance | undefined;

  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();

  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  // TS compiler API fallback for TAGS_REQUIRING_RAW_TEXT: handles tags that
  // the regex parser misses (e.g. malformed or unusual comment syntax).
  const rawTextFallbacks = collectRawTextFallbacks(node, file);

  const extensionTagNames = getExtensionTagNames(options);

  if (commentRanges) {
    for (const range of commentRanges) {
      // Only parse /** ... */ comments (kind 3 = MultiLineCommentTrivia)
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) {
        continue;
      }

      const extensions = options?.extensionRegistry?.extensions;
      const unified = parseUnifiedComment(commentText, {
        offset: range.pos,
        extensionTagNames,
        ...(extensions !== undefined ? { extensions } : {}),
      });

      for (const tag of unified.tags) {
        const tagName = tag.normalizedTagName;

        if (tagName === "displayName" || tagName === "format" || tagName === "placeholder") {
          const text = tag.resolvedPayloadText;
          if (text === "") continue;

          const provenance = provenanceForParsedTag(tag, sourceFile, file);
          switch (tagName) {
            case "displayName":
              if (!isMemberTargetDisplayName(text) && displayName === undefined) {
                displayName = text;
                displayNameProvenance = provenance;
              }
              break;

            case "format":
              annotations.push({
                kind: "annotation",
                annotationKind: "format",
                value: text,
                provenance,
              });
              break;

            case "placeholder":
              if (placeholder === undefined) {
                placeholder = text;
                placeholderProvenance = provenance;
              }
              break;
          }
          continue;
        }

        if (TAGS_REQUIRING_RAW_TEXT.has(tagName)) {
          // Consume corresponding compiler-API fallback entry (aligning by tag order).
          // Use choosePreferredPayloadText to handle multi-line payloads: the
          // regex parser's span may only capture the first line (e.g. `{`), while
          // the TS compiler API provides the full content for multi-line payloads.
          const fallback = rawTextFallbacks.get(tagName)?.shift();
          const text = choosePreferredPayloadText(tag.resolvedPayloadText, fallback?.text ?? "");
          if (text === "") continue;

          const provenance = provenanceForParsedTag(tag, sourceFile, file);
          if (tagName === "defaultValue") {
            annotations.push(parseDefaultValueTagValue(text, provenance));
            continue;
          }

          processConstraintTag(
            tagName,
            text,
            tag,
            provenance,
            node,
            sourceFile,
            options,
            constraints,
            diagnostics
          );
          continue;
        }

        // Regular constraint tag (not requiring raw text)
        const text = tag.resolvedPayloadText;
        const expectedType = isBuiltinConstraintName(tagName)
          ? BUILTIN_CONSTRAINT_DEFINITIONS[tagName]
          : undefined;
        if (text === "" && expectedType !== "boolean") continue;

        const provenance = provenanceForParsedTag(tag, sourceFile, file);
        processConstraintTag(
          tagName,
          text,
          tag,
          provenance,
          node,
          sourceFile,
          options,
          constraints,
          diagnostics
        );
      }

      // Extract @deprecated from the unified parse result
      if (unified.isDeprecated) {
        annotations.push({
          kind: "annotation",
          annotationKind: "deprecated",
          ...(unified.deprecationMessage !== "" && { message: unified.deprecationMessage }),
          provenance: provenanceForComment(range, sourceFile, file, "deprecated"),
        });
      }

      // Summary text → description annotation (spec 002 §2.3)
      if (unified.summaryText !== "") {
        annotations.push({
          kind: "annotation",
          annotationKind: "description",
          value: unified.summaryText,
          provenance: provenanceForComment(range, sourceFile, file, "summary"),
        });
      }

      // @remarks → separate remarks annotation (spec 002 §2.3)
      if (unified.remarksText !== "") {
        annotations.push({
          kind: "annotation",
          annotationKind: "remarks",
          value: unified.remarksText,
          provenance: provenanceForComment(range, sourceFile, file, "remarks"),
        });
      }
    }
  }

  if (displayName !== undefined && displayNameProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "displayName",
      value: displayName,
      provenance: displayNameProvenance,
    });
  }

  if (placeholder !== undefined && placeholderProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "placeholder",
      value: placeholder,
      provenance: placeholderProvenance,
    });
  }

  // Process orphaned TS compiler API fallbacks: tags found by ts.getJSDocTags()
  // that were not matched by the regex parser (e.g. malformed comment syntax).
  for (const [tagName, fallbacks] of rawTextFallbacks) {
    for (const fallback of fallbacks) {
      const text = fallback.text.trim();
      if (text === "") continue;

      const provenance = fallback.provenance;
      if (tagName === "defaultValue") {
        annotations.push(parseDefaultValueTagValue(text, provenance));
        continue;
      }

      processConstraintTag(
        tagName,
        text,
        null,
        provenance,
        node,
        sourceFile,
        options,
        constraints,
        diagnostics
      );
    }
  }

  const result = { constraints, annotations, diagnostics };
  parseResultCache.set(cacheKey, result);
  return result;
}

/**
 * Checks if a TS AST node has a `@deprecated` tag using the unified parser.
 */
export function hasDeprecatedTagTSDoc(node: ts.Node): boolean {
  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  if (commentRanges) {
    for (const range of commentRanges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) continue;

      if (parseUnifiedComment(commentText).isDeprecated) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts root and member-target display-name metadata from a node's JSDoc tags.
 *
 * Member-target display-name tags use the syntax `@displayName :member Label`.
 * The first non-target `@displayName` is returned as the root display name.
 */
export function extractDisplayNameMetadata(node: ts.Node): DisplayNameMetadata {
  let displayName: string | undefined;
  const memberDisplayNames = new Map<string, string>();
  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  if (commentRanges) {
    for (const range of commentRanges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) continue;

      const unified = parseUnifiedComment(commentText);
      for (const tag of unified.tags) {
        if (tag.normalizedTagName !== "displayName") {
          continue;
        }

        if (tag.target !== null && tag.argumentText !== "") {
          memberDisplayNames.set(tag.target.rawText, tag.argumentText);
          continue;
        }

        if (tag.argumentText !== "") {
          displayName ??= tag.argumentText;
        }
      }
    }
  }

  return {
    ...(displayName !== undefined && { displayName }),
    memberDisplayNames,
  };
}

// =============================================================================
// PUBLIC HELPERS — path target extraction
// =============================================================================

/**
 * Extracts a path-target prefix (`:fieldName`) from constraint tag text.
 * Returns the parsed PathTarget and remaining text, or null if no path target.
 *
 * @example
 * extractPathTarget(":value 0") // → { path: { segments: ["value"] }, remainingText: "0" }
 * extractPathTarget("42")       // → null
 */
export function extractPathTarget(
  text: string
): { path: PathTarget; remainingText: string } | null {
  return extractSharedPathTarget(text);
}

function collectRawTextFallbacks(
  node: ts.Node,
  file: string
): Map<string, { text: string; provenance: Provenance }[]> {
  const fallbacks = new Map<string, { text: string; provenance: Provenance }[]>();

  for (const tag of ts.getJSDocTags(node)) {
    const tagName = normalizeConstraintTagName(tag.tagName.text);
    if (!TAGS_REQUIRING_RAW_TEXT.has(tagName)) continue;

    const commentText = getTagCommentText(tag)?.trim() ?? "";
    if (commentText === "") continue;

    const entries = fallbacks.get(tagName) ?? [];
    entries.push({
      text: commentText,
      provenance: provenanceForJSDocTag(tag, file),
    });
    fallbacks.set(tagName, entries);
  }

  return fallbacks;
}

// =============================================================================
// PRIVATE HELPERS — constraint value parsing
// =============================================================================

function isMemberTargetDisplayName(text: string): boolean {
  return parseTagSyntax("displayName", text).target !== null;
}

// =============================================================================
// PRIVATE HELPERS — provenance
// =============================================================================

function provenanceForComment(
  range: ts.CommentRange,
  sourceFile: ts.SourceFile,
  file: string,
  tagName: string
): Provenance {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tagName,
  };
}

function provenanceForParsedTag(
  tag: ParsedCommentTag,
  sourceFile: ts.SourceFile,
  file: string
): Provenance {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(tag.tagNameSpan.start);
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tag.normalizedTagName,
  };
}

function provenanceForJSDocTag(tag: ts.JSDocTag, file: string): Provenance {
  const sourceFile = tag.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(tag.getStart());
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tag.tagName.text,
  };
}

/**
 * Extracts the text content from a TypeScript JSDoc tag's comment.
 */
function getTagCommentText(tag: ts.JSDocTag): string | undefined {
  if (tag.comment === undefined) {
    return undefined;
  }
  if (typeof tag.comment === "string") {
    return tag.comment;
  }
  return ts.getTextOfJSDocComment(tag.comment);
}
