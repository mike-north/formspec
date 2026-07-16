import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  isBuiltinConstraintName,
  type BuiltinConstraintBroadeningRegistration,
  type ConstraintNode,
  type ConstraintTagRegistration,
  type CustomConstraintRegistration,
  type DefaultValueAnnotationNode,
  type ExampleAnnotationNode,
  type ExtensionDefinition,
  type JsonValue,
  type LengthConstraintNode,
  type NumericConstraintNode,
  type PathTarget,
  type PrimitiveTypeNode,
  type Provenance,
  type TypeNode,
} from "@formspec/core/internals";
import { parseTagSyntax } from "./comment-syntax.js";
import { getJsonLikeBalanceStatus } from "./json-like-balance.js";
import { parseTagArgument } from "./tag-argument-parser.js";

const NUMERIC_CONSTRAINT_MAP: Record<string, NumericConstraintNode["constraintKind"]> = {
  minimum: "minimum",
  maximum: "maximum",
  exclusiveMinimum: "exclusiveMinimum",
  exclusiveMaximum: "exclusiveMaximum",
  multipleOf: "multipleOf",
};

const LENGTH_CONSTRAINT_MAP: Record<string, LengthConstraintNode["constraintKind"]> = {
  minLength: "minLength",
  maxLength: "maxLength",
  minItems: "minItems",
  maxItems: "maxItems",
};

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export interface ConstraintTagParseRegistryLike {
  readonly extensions: readonly ExtensionDefinition[];
  findConstraint(constraintId: string): CustomConstraintRegistration | undefined;
  findConstraintTag(tagName: string):
    | {
        readonly extensionId: string;
        readonly registration: ConstraintTagRegistration;
      }
    | undefined;
  findBuiltinConstraintBroadening(
    typeId: string,
    tagName: string
  ):
    | {
        readonly extensionId: string;
        readonly registration: BuiltinConstraintBroadeningRegistration;
      }
    | undefined;
}

export interface ParseConstraintTagValueOptions {
  readonly registry?: ConstraintTagParseRegistryLike;
  readonly fieldType?: TypeNode;
  /**
   * For path-targeted built-in constraint tags, the custom type ID that the
   * path resolves to (if the terminal sub-type is a registered custom type).
   * When present, this is consulted for built-in constraint broadening in
   * place of `fieldType` — the field's own type describes the wrong thing
   * for a path-targeted tag.
   *
   * Only the build consumer has the compiler-level resolution needed to
   * compute this value; other consumers may safely omit it.
   */
  readonly pathResolvedCustomTypeId?: string;
}

function syntaxOptions(
  registry: ConstraintTagParseRegistryLike | undefined
): Parameters<typeof parseTagSyntax>[2] {
  return registry?.extensions !== undefined ? { extensions: registry.extensions } : undefined;
}

export function parseConstraintTagValue(
  tagName: string,
  text: string,
  provenance: Provenance,
  options?: ParseConstraintTagValueOptions
): ConstraintNode | null {
  const customConstraint = parseExtensionConstraintTagValue(tagName, text, provenance, options);
  if (customConstraint !== null) {
    return customConstraint;
  }

  if (!isBuiltinConstraintName(tagName)) {
    return null;
  }

  const parsedTag = parseTagSyntax(tagName, text, syntaxOptions(options?.registry));
  if (parsedTag.target !== null && !parsedTag.target.valid) {
    return null;
  }

  const effectiveText = parsedTag.argumentText;
  const path = parsedTag.target?.path ?? undefined;
  const expectedType = BUILTIN_CONSTRAINT_DEFINITIONS[tagName];

  if (expectedType !== "boolean" && effectiveText.trim() === "") {
    return null;
  }

  if (expectedType === "number") {
    // Consolidation (issue #513): route the IR-producing path through the shared
    // typed-argument validator so the constraint node and the surfaced diagnostic
    // agree on every input. This rejects non-finite numerics (`Infinity`, `1e999`),
    // non-decimal forms (`0x10` — previously silently became 16), and — for the
    // length family — negative/fractional values. A rejected argument produces no
    // node, so the invalid keyword never reaches the generated schema (002 §3.2, PP6).
    const parsed = parseTagArgument(tagName, effectiveText, "build");
    if (!parsed.ok || parsed.value.kind !== "number") {
      return null;
    }
    const value = parsed.value.value;

    const numericKind = NUMERIC_CONSTRAINT_MAP[tagName as keyof typeof NUMERIC_CONSTRAINT_MAP];
    if (numericKind !== undefined) {
      return {
        kind: "constraint",
        constraintKind: numericKind,
        value,
        ...(path !== undefined && { path }),
        provenance,
      };
    }

    const lengthKind = LENGTH_CONSTRAINT_MAP[tagName as keyof typeof LENGTH_CONSTRAINT_MAP];
    if (lengthKind !== undefined) {
      return {
        kind: "constraint",
        constraintKind: lengthKind,
        value,
        ...(path !== undefined && { path }),
        provenance,
      };
    }

    return null;
  }

  if (expectedType === "boolean") {
    const trimmed = effectiveText.trim();
    if (trimmed !== "" && trimmed !== "true") {
      return null;
    }

    if (tagName === "uniqueItems") {
      return {
        kind: "constraint",
        constraintKind: "uniqueItems",
        value: true,
        ...(path !== undefined && { path }),
        provenance,
      };
    }

    return null;
  }

  if (expectedType === "json") {
    if (tagName === "const") {
      const trimmedText = effectiveText.trim();
      if (trimmedText === "") {
        return null;
      }
      if (getJsonLikeBalanceStatus(effectiveText) === "unbalanced") {
        return null;
      }

      try {
        const parsed = JSON.parse(trimmedText) as JsonValue;
        return {
          kind: "constraint",
          constraintKind: "const",
          value: parsed,
          ...(path !== undefined && { path }),
          provenance,
        };
      } catch {
        return {
          kind: "constraint",
          constraintKind: "const",
          value: trimmedText,
          ...(path !== undefined && { path }),
          provenance,
        };
      }
    }

    const parsed = tryParseJson(effectiveText);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const members: (string | number)[] = [];
    for (const item of parsed) {
      if (typeof item === "string" || typeof item === "number") {
        members.push(item);
        continue;
      }

      if (typeof item === "object" && item !== null && "id" in item) {
        const id = (item as Record<string, unknown>)["id"];
        if (typeof id === "string" || typeof id === "number") {
          members.push(id);
        }
      }
    }

    return {
      kind: "constraint",
      constraintKind: "allowedMembers",
      members,
      ...(path !== undefined && { path }),
      provenance,
    };
  }

  // Pattern (string family): route through the shared validator so an
  // uncompilable regex (e.g. `(`) produces no constraint node — the invalid
  // `pattern` keyword must never reach the schema, where it would crash any
  // validator at schema-compile time (002 §3.2, issue #513).
  const parsedPattern = parseTagArgument(tagName, effectiveText, "build");
  if (!parsedPattern.ok || parsedPattern.value.kind !== "string") {
    return null;
  }
  return {
    kind: "constraint",
    constraintKind: "pattern",
    pattern: parsedPattern.value.value,
    ...(path !== undefined && { path }),
    provenance,
  };
}

/**
 * Parses a single `@example` tag payload into an {@link ExampleAnnotationNode}.
 *
 * Per spec 002 §3.2, the tag text is parsed as JSON; when JSON parsing fails,
 * the raw (trimmed) text is carried through as a string. Unlike
 * {@link parseDefaultValueTagValue}, this uses a direct `JSON.parse` so that a
 * literal `null` payload is preserved as JSON `null` (rather than being
 * indistinguishable from a parse failure).
 */
export function parseExampleTagValue(text: string, provenance: Provenance): ExampleAnnotationNode {
  const trimmed = text.trim();
  let value: JsonValue;
  try {
    value = JSON.parse(trimmed) as JsonValue;
  } catch {
    value = trimmed;
  }

  return {
    kind: "annotation",
    annotationKind: "example",
    value,
    provenance,
  };
}

/**
 * Successful outcome of {@link parseDefaultValueTagValue}: a
 * {@link DefaultValueAnnotationNode} ready to attach to the field's IR.
 */
export interface DefaultValueParseValue {
  readonly kind: "value";
  readonly annotation: DefaultValueAnnotationNode;
}

/**
 * Outcome of {@link parseDefaultValueTagValue} when the tag text has no
 * valid interpretation under the resolved target type (spec 002 §3.2:
 * "Only if no valid non-string interpretation fits does the extractor fall
 * back to string" — and only when the target type itself accepts a string).
 * Callers must surface this as a diagnostic rather than emitting a `default`
 * that would fail the field's own subschema (docs/000-principles.md PP6/B4).
 */
export interface DefaultValueParseMismatch {
  readonly kind: "mismatch";
  readonly message: string;
}

export type DefaultValueParseResult = DefaultValueParseValue | DefaultValueParseMismatch;

/** Primitive kind vocabulary shared with {@link PrimitiveTypeNode}. */
type BuiltinPrimitiveKind = PrimitiveTypeNode["primitiveKind"];

function makeDefaultValueAnnotation(
  value: JsonValue,
  provenance: Provenance
): DefaultValueParseValue {
  return {
    kind: "value",
    annotation: {
      kind: "annotation",
      annotationKind: "defaultValue",
      value,
      provenance,
    },
  };
}

/**
 * Legacy, type-agnostic parse used when no resolvable built-in target type
 * is available (e.g. `@formspec/analysis` consumers — such as the IDE/LSP
 * snapshot path in `file-snapshots.ts` — that don't thread a resolved
 * `TypeNode` through, or target types outside this issue's built-in-type
 * scope: object/array/reference/custom/enum types). Preserves the
 * pre-#517 behavior for those callers rather than guessing at coercion
 * without type information.
 */
function legacyParseDefaultValue(trimmed: string): JsonValue {
  if (trimmed === "null") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const parsed = tryParseJson(trimmed);
  return parsed !== null ? (parsed as JsonValue) : trimmed;
}

/**
 * Collects the set of built-in primitive kinds a `@defaultValue` may
 * validly coerce to for the given target type, per spec 002 §3.2. Returns
 * `null` when the target type is not a primitive or a union composed
 * entirely of primitives — i.e. it falls outside this issue's built-in-type
 * scope (object/array/reference/custom/enum types), in which case callers
 * fall back to {@link legacyParseDefaultValue}.
 */
function collectPermittedPrimitiveKinds(typeNode: TypeNode): Set<BuiltinPrimitiveKind> | null {
  if (typeNode.kind === "primitive") {
    return new Set([typeNode.primitiveKind]);
  }

  if (typeNode.kind === "union") {
    const kinds = new Set<BuiltinPrimitiveKind>();
    for (const member of typeNode.members) {
      const memberKinds = collectPermittedPrimitiveKinds(member);
      if (memberKinds === null) {
        return null;
      }
      for (const kind of memberKinds) {
        kinds.add(kind);
      }
    }
    return kinds;
  }

  return null;
}

function describePermittedPrimitiveKinds(kinds: ReadonlySet<BuiltinPrimitiveKind>): string {
  return [...kinds].sort().join(" | ");
}

function makeDefaultValueMismatch(
  rawText: string,
  permittedKinds: ReadonlySet<BuiltinPrimitiveKind>
): DefaultValueParseMismatch {
  return {
    kind: "mismatch",
    message:
      `@defaultValue value "${rawText}" has no valid interpretation for target type ` +
      `"${describePermittedPrimitiveKinds(permittedKinds)}" (spec 002 §3.2). Provide a value ` +
      `compatible with the field's type, or quote it explicitly (e.g. @defaultValue "${rawText}") ` +
      `if a string default is intended.`,
  };
}

/** Result of attempting to `JSON.parse` a `@defaultValue` tag payload. */
type JsonParseAttempt = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function attemptJsonParse(trimmed: string): JsonParseAttempt {
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Coerces an already-parsed JSON value to a non-string interpretation
 * permitted by `permittedKinds`. Returns `undefined` when the parsed
 * value's kind is not permitted by the target type (spec 002 §3.2 —
 * "attempts to coerce to a valid non-string type permitted by the
 * resolved target type").
 *
 * Numbers are additionally checked against the `integer` kind (a
 * value-compatible superset of `number` for JSON purposes: every JSON
 * integer literal is representable as both) so `@defaultValue 6` on an
 * integer-branded field resolves the same way it does for a plain `number`
 * field, without requiring a separate ambiguity check — both kinds accept
 * the identical parsed value, so there is no competing interpretation to
 * disambiguate (see the "ambiguous" note on {@link parseDefaultValueTagValue}
 * for why true ambiguity does not arise for pure built-in unions).
 */
function coerceParsedJsonToNonString(
  parsed: unknown,
  permittedKinds: ReadonlySet<BuiltinPrimitiveKind>
): { readonly value: JsonValue } | undefined {
  if (parsed === null) {
    return permittedKinds.has("null") ? { value: null } : undefined;
  }
  if (typeof parsed === "boolean") {
    return permittedKinds.has("boolean") ? { value: parsed } : undefined;
  }
  if (typeof parsed === "number") {
    if (permittedKinds.has("number")) {
      return { value: parsed };
    }
    if (permittedKinds.has("integer") && Number.isInteger(parsed)) {
      return { value: parsed };
    }
    return undefined;
  }

  // Strings are handled by the quoted-string short-circuit before this is
  // reached; arrays/objects are outside this issue's built-in-type scope
  // (see the "Non-goals" section of GitHub issue #517).
  return undefined;
}

/**
 * Parses a `@defaultValue` tag payload into a {@link DefaultValueAnnotationNode},
 * type-directed against the resolved target type per spec 002 §3.2:
 *
 * ```
 * value ::= json-value | text-until-end-of-line
 * ```
 *
 * - Quoted JSON strings (`@defaultValue "6"`) are always explicit strings,
 *   even when the target type also permits a non-string interpretation.
 * - For unquoted values, a valid non-string interpretation permitted by
 *   `targetType` is attempted first (e.g. `@defaultValue 6` on a `number`
 *   field yields the number `6`).
 * - Only if no non-string interpretation fits does the extractor fall back
 *   to the raw text as a string — and only when the target type itself
 *   accepts a string (`@defaultValue pending` on a `string` field yields
 *   the string `"pending"`).
 * - If neither a non-string interpretation nor a string fallback is valid
 *   for the target type, parsing fails with a
 *   {@link DefaultValueParseMismatch} rather than silently emitting a
 *   `default` that would violate the field's own subschema.
 *
 * On the spec's "multiple non-string interpretations would be valid and
 * ambiguous" case: for target types composed purely of built-in primitives
 * (this function's scope — object/array/reference/custom/enum target types
 * fall back to {@link legacyParseDefaultValue} instead), `JSON.parse`
 * always yields a single JS runtime type (string, number, boolean, or
 * null) for any given literal, and those runtime types are mutually
 * exclusive by JSON grammar construction. So no built-in-only union can
 * produce two *different* valid values for the same tag text — ambiguity
 * in that sense cannot arise in this function's scope. The case remains
 * meaningful for future coercion against custom/enum target types (out of
 * scope here — see issue #360), where two different value spaces could
 * both legitimately claim the same literal.
 *
 * @param targetType - The resolved target type (the field itself; path-target
 * subfield resolution is not yet supported for `@defaultValue`). When
 * omitted, or when it falls outside the built-in primitive/union-of-primitive
 * scope described above, parsing falls back to
 * {@link legacyParseDefaultValue} (untyped, pre-#517 behavior).
 */
export function parseDefaultValueTagValue(
  text: string,
  provenance: Provenance,
  targetType?: TypeNode
): DefaultValueParseResult {
  const trimmed = text.trim();
  const permittedKinds =
    targetType === undefined ? null : collectPermittedPrimitiveKinds(targetType);

  if (permittedKinds === null) {
    return makeDefaultValueAnnotation(legacyParseDefaultValue(trimmed), provenance);
  }

  const attempt = attemptJsonParse(trimmed);

  // Quoted JSON strings are always explicit strings (spec 002 §3.2), even
  // when the target type would otherwise permit a non-string interpretation.
  if (attempt.ok && typeof attempt.value === "string") {
    if (!permittedKinds.has("string")) {
      return makeDefaultValueMismatch(trimmed, permittedKinds);
    }
    return makeDefaultValueAnnotation(attempt.value, provenance);
  }

  if (attempt.ok) {
    const coerced = coerceParsedJsonToNonString(attempt.value, permittedKinds);
    if (coerced !== undefined) {
      return makeDefaultValueAnnotation(coerced.value, provenance);
    }
  }

  if (permittedKinds.has("string")) {
    return makeDefaultValueAnnotation(trimmed, provenance);
  }

  return makeDefaultValueMismatch(trimmed, permittedKinds);
}

function parseExtensionConstraintTagValue(
  tagName: string,
  text: string,
  provenance: Provenance,
  options?: ParseConstraintTagValueOptions
): ConstraintNode | null {
  const parsedTag = parseTagSyntax(tagName, text, syntaxOptions(options?.registry));
  if (parsedTag.target !== null && !parsedTag.target.valid) {
    return null;
  }

  const effectiveText = parsedTag.argumentText;
  const path = parsedTag.target?.path ?? undefined;
  const registry = options?.registry;
  if (registry === undefined) {
    return null;
  }

  if (effectiveText.trim() === "") {
    return null;
  }

  const directTag = registry.findConstraintTag(tagName);
  if (directTag !== undefined) {
    return makeCustomConstraintNode(
      directTag.extensionId,
      directTag.registration.constraintName,
      directTag.registration.parseValue(effectiveText),
      provenance,
      path,
      registry
    );
  }

  if (!isBuiltinConstraintName(tagName)) {
    return null;
  }

  // For path-targeted built-in tags, the field's own type describes the
  // wrong thing — the broadening lookup must target the path-resolved
  // terminal type. The caller (the build consumer) is the only layer with
  // compiler-level access to resolve this, and supplies the result via
  // `pathResolvedCustomTypeId`. When `path` is present we consult only
  // that input; when `path` is absent (direct-field case) we consult the
  // IR `fieldType` as before.
  const broadenedTypeId =
    path !== undefined
      ? options?.pathResolvedCustomTypeId
      : getBroadenedCustomTypeId(options?.fieldType);
  if (broadenedTypeId === undefined) {
    return null;
  }

  const broadened = registry.findBuiltinConstraintBroadening(broadenedTypeId, tagName);
  if (broadened === undefined) {
    return null;
  }

  return makeCustomConstraintNode(
    broadened.extensionId,
    broadened.registration.constraintName,
    broadened.registration.parseValue(effectiveText),
    provenance,
    path,
    registry
  );
}

/**
 * Resolves the broadening-eligible custom type ID for a field's IR type.
 *
 * Returns the `CustomTypeNode.typeId` when the field type is directly custom,
 * OR when it's a nullable-single-custom union (`T | null`). Returns `undefined`
 * for any other shape — the caller's broadening lookup then falls through.
 *
 * Exported from `@formspec/analysis/internal` so the build consumer can reuse
 * exactly the same "what counts as a broadenable custom field type" rule
 * without maintaining a drift-prone duplicate. See PR #398 / issue #395.
 */
export function getBroadenedCustomTypeId(fieldType: TypeNode | undefined): string | undefined {
  if (fieldType?.kind === "custom") {
    return fieldType.typeId;
  }

  if (fieldType?.kind !== "union") {
    return undefined;
  }

  const customMembers = fieldType.members.filter(
    (member): member is Extract<TypeNode, { kind: "custom" }> => member.kind === "custom"
  );
  if (customMembers.length !== 1) {
    return undefined;
  }

  const nonCustomMembers = fieldType.members.filter((member) => member.kind !== "custom");
  const allOtherMembersAreNull = nonCustomMembers.every(
    (member) => member.kind === "primitive" && member.primitiveKind === "null"
  );

  const customMember = customMembers[0];
  return allOtherMembersAreNull && customMember !== undefined ? customMember.typeId : undefined;
}

function makeCustomConstraintNode(
  extensionId: string,
  constraintName: string,
  payload: JsonValue,
  provenance: Provenance,
  path: PathTarget | undefined,
  registry: ConstraintTagParseRegistryLike
): ConstraintNode {
  const constraintId = `${extensionId}/${constraintName}`;
  const registration = registry.findConstraint(constraintId);
  if (registration === undefined) {
    throw new Error(
      `Custom TSDoc tag resolved to unregistered constraint "${constraintId}". Register the constraint before using its tag.`
    );
  }

  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId,
    payload,
    compositionRule: registration.compositionRule,
    ...(path !== undefined && { path }),
    provenance,
  };
}
