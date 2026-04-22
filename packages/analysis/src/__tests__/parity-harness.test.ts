/**
 * Cross-consumer parity harness (originally Phase 0.5a; updated Phase 5C).
 *
 * Runs a build-path proxy (Role A placement pre-check + Role B capability
 * guard + `@const` IR check + Role C typed-parser argument validation — the
 * same gates the real build path in `tsdoc-parser.ts` applies) and the
 * SNAPSHOT path (via {@link buildFormSpecAnalysisFileSnapshot}) over a
 * parametric fixture suite covering the full matrix of constraint tag ×
 * subject type × argument shape.
 *
 * For each fixture, the two consumer outputs are normalised into
 * {@link ParityLogEntry} slices and compared with {@link diffParityLogs}.
 * The test asserts either:
 *
 *   (a) `diff.length === 0` — the two consumers agree, or
 *   (b) every divergence matches an entry in {@link KNOWN_DIVERGENCES}.
 *
 * §5 Phase 5C retired the synthetic TypeScript program batch, so the two
 * consumers now share a unified validation path; most previously-known
 * divergences are resolved and KNOWN_DIVERGENCES is empty by default.
 *
 * ## Scope and tautology acknowledgement
 *
 * After Phase 5C, `runBuildConsumer` calls the SAME shared helpers that the
 * snapshot consumer calls (`_supportsConstraintCapability` for Role B,
 * `_checkConstValueAgainstType` for `@const` IR checks, `parseTagArgument`
 * for Role C, `getMatchingTagSignatures` for Role A). That is intentional —
 * both consumers run through the unified pipeline — but it also means this
 * harness can no longer detect drift between the two consumers within those
 * shared sections: any bug in a shared helper would be reflected identically
 * on both sides.
 *
 * This harness therefore serves as a **structural fixture enumeration** —
 * it pins that the full matrix of constraint tag × subject type × argument
 * shape flows through the unified pipeline without surprise diagnostics. For
 * real cross-consumer divergence detection (end-to-end through the actual
 * build path vs the snapshot path, not through shared helpers), consult:
 *
 *   - `packages/build/src/__tests__/parity-divergences.test.ts` — end-to-end
 *     `generateSchemas` cross-consumer comparison.
 *   - `packages/build/src/__tests__/alias-chain-propagation.test.ts` —
 *     alias-chain coverage (#363).
 *
 * @see docs/refactors/synthetic-checker-retirement.md §9.1 #1
 * @see docs/refactors/synthetic-checker-retirement.md §3 (divergence catalogue)
 */

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  _checkConstValueAgainstType,
  _supportsConstraintCapability,
  buildFormSpecAnalysisFileSnapshot,
  describeTypeKind,
  getMatchingTagSignatures,
  getSubjectType,
  getTagDefinition,
  parseTagArgument,
  resolveDeclarationPlacement,
} from "../internal.js";
import type { FormSpecAnalysisDiagnostic } from "../protocol.js";
import { diffParityLogs } from "./helpers/diff-parity-logs.js";
import type { ParityDivergence } from "./helpers/diff-parity-logs.js";
import type { ParityLogEntry, RoleOutcome } from "./helpers/parity-log-entry.js";
import { createProgram } from "./helpers.js";

// ---------------------------------------------------------------------------
// §3 Known divergences
//
// Build path lowering vs snapshot path lowering diverge on three known inputs.
// These are captured here so new, *unexpected* divergences cause test failures.
// Each entry references the §3 catalogue entry it corresponds to.
// ---------------------------------------------------------------------------

/**
 * Describes a divergence that is expected between the build and snapshot
 * consumers for a specific fixture key.
 *
 * `fixtureLabel` is the human-readable label from `ParityFixture.label`.
 * `divergenceKind` is the kind of divergence as returned by `diffParityLogs`.
 */
interface KnownDivergenceEntry {
  /** Fixture label that exhibits this divergence. */
  readonly fixtureLabel: string;
  /**
   * Which kind of divergence to expect.
   * `"any"` matches any divergence kind for that fixture key (used when the
   * exact kind may vary across environments).
   */
  readonly divergenceKind: ParityDivergence["kind"] | "any";
  /** Short rationale cross-referencing the §3 catalogue entry. */
  readonly reason: string;
}

/**
 * Pinned list of known build/snapshot divergences.
 *
 * §3 catalogue history (kept for reference — every entry has been resolved):
 *   - `@const not-json` (§3): Build path formerly passed a quoted string
 *     literal into the synthetic program; snapshot omitted the argument.
 *     Phase 5C — synthetic retirement — resolves this; both consumers now
 *     route Role C through the typed parser, which applies the same
 *     raw-string-fallback policy on both sides.
 *   - `@minimum Infinity` / `@minimum NaN` (§3): NORMALIZED in Phase 2 and
 *     kept identical in Phase 5C.
 *   - Integer-brand snapshot-path gap (#315 / #325): resolved in Phase 4A.
 *   - Alias-chain type-resolution divergence (#363): resolved in Phase 5C.
 *     Both consumers now share a unified validation path that never invokes
 *     the synthetic prelude, so alias-name vs primitive-base differences no
 *     longer cause divergent outcomes.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5C
 */
const KNOWN_DIVERGENCES: readonly KnownDivergenceEntry[] = [];

// ---------------------------------------------------------------------------
// ParityFixture type
// ---------------------------------------------------------------------------

/**
 * One cross-consumer parity fixture.
 *
 * Each fixture defines a constraint tag + subject type + argument combination
 * that is exercised against both the build and snapshot consumers. The fixture
 * generates an in-memory TypeScript class for each combination.
 */
interface ParityFixture {
  /** Human-readable label for test output and known-divergence matching. */
  readonly label: string;
  /** The constraint tag name, without `@`, e.g. `"minimum"`. */
  readonly tagName: string;
  /** TypeScript type expression for the field, e.g. `"number"` or `"string | null"`. */
  readonly subjectType: string;
  /**
   * The raw tag argument text, exactly as it would appear in the TSDoc comment,
   * e.g. `"0"`, `'"USD"'`, `'"^\\\\d+$"'`.
   */
  readonly tagArgument: string;
  /**
   * Optional preamble declarations placed before the class, e.g. type aliases.
   * Used for alias-chain propagation tests.
   */
  readonly preamble?: string;
  /**
   * When `"type-alias"`, the tag is placed on a top-level `type MyType = ...`
   * declaration instead of a class field. This exercises `type-alias` placement
   * rather than `class-field` placement, enabling misplacement fixtures for
   * tags that only support field placements (e.g. `@minimum`).
   */
  readonly targetDeclaration?: "type-alias";
}

// ---------------------------------------------------------------------------
// Fixture matrix
// ---------------------------------------------------------------------------

/**
 * Full parametric fixture suite.
 *
 * Coverage per the §9.1 #1 requirement:
 *   - @minimum 0   × number, string, Integer, number | null, number?
 *   - @maximum 100 × number, string
 *   - @minLength 1 × string, number, string[]
 *   - @maxLength 50 × string
 *   - @pattern "^\\d+$" × string, number
 *   - @enumOptions ["a","b"] × string, number
 *   - @const "USD" × string, number, object
 *   - @uniqueItems × string[], string
 *   - Alias-chain propagation: constraint on base alias propagates through derived alias
 *
 * Plus the three §3 divergence cases (@const not-json, @minimum Infinity, @minimum NaN)
 * and the Integer-brand snapshot-path gap case.
 */
const FIXTURES: readonly ParityFixture[] = [
  // -------------------------------------------------------------------------
  // @minimum 0
  // -------------------------------------------------------------------------
  {
    label: "@minimum 0 on number",
    tagName: "minimum",
    subjectType: "number",
    tagArgument: "0",
  },
  {
    label: "@minimum 0 on string",
    tagName: "minimum",
    subjectType: "string",
    tagArgument: "0",
  },
  {
    label: "@minimum 0 on Integer",
    tagName: "minimum",
    subjectType: "Integer",
    tagArgument: "0",
    preamble:
      "declare const __integerBrand: unique symbol;\ntype Integer = number & { readonly [__integerBrand]: true };",
  },
  {
    label: "@minimum 0 on number | null",
    tagName: "minimum",
    subjectType: "number | null",
    tagArgument: "0",
  },
  {
    label: "@minimum 0 on optional number",
    tagName: "minimum",
    subjectType: "number | undefined",
    tagArgument: "0",
  },

  // -------------------------------------------------------------------------
  // @maximum 100
  // -------------------------------------------------------------------------
  {
    label: "@maximum 100 on number",
    tagName: "maximum",
    subjectType: "number",
    tagArgument: "100",
  },
  {
    label: "@maximum 100 on string",
    tagName: "maximum",
    subjectType: "string",
    tagArgument: "100",
  },

  // -------------------------------------------------------------------------
  // @minLength 1
  // -------------------------------------------------------------------------
  {
    label: "@minLength 1 on string",
    tagName: "minLength",
    subjectType: "string",
    tagArgument: "1",
  },
  {
    label: "@minLength 1 on number",
    tagName: "minLength",
    subjectType: "number",
    tagArgument: "1",
  },
  {
    label: "@minLength 1 on string[]",
    tagName: "minLength",
    subjectType: "string[]",
    tagArgument: "1",
  },

  // -------------------------------------------------------------------------
  // @maxLength 50
  // -------------------------------------------------------------------------
  {
    label: "@maxLength 50 on string",
    tagName: "maxLength",
    subjectType: "string",
    tagArgument: "50",
  },

  // -------------------------------------------------------------------------
  // @pattern "^\\d+$"
  // -------------------------------------------------------------------------
  {
    label: '@pattern "^\\\\d+$" on string',
    tagName: "pattern",
    subjectType: "string",
    tagArgument: "^\\d+$",
  },
  {
    label: '@pattern "^\\\\d+$" on number',
    tagName: "pattern",
    subjectType: "number",
    tagArgument: "^\\d+$",
  },

  // -------------------------------------------------------------------------
  // @enumOptions ["a","b"]
  // -------------------------------------------------------------------------
  {
    label: '@enumOptions ["a","b"] on string',
    tagName: "enumOptions",
    subjectType: "string",
    tagArgument: '["a","b"]',
  },
  {
    label: '@enumOptions ["a","b"] on number',
    tagName: "enumOptions",
    subjectType: "number",
    tagArgument: '["a","b"]',
  },

  // -------------------------------------------------------------------------
  // @const "USD" (happy path only — both consumers should accept)
  //
  // NOTE (Panel Fix #5): the IR-check sub-cases (`@const "USD" on number`,
  // `@const "USD" on object`) were removed because the parity harness's
  // `runBuildConsumer` proxies Phase 5B by calling the SAME
  // `_checkConstValueAgainstType` function the snapshot consumer uses. That
  // makes those fixtures tautological — they cannot detect drift from the real
  // build path's IR validator in `semantic-targets.ts`.
  //
  // Real cross-consumer coverage for @const IR-check parity lives in:
  //   - packages/build/src/__tests__/parity-divergences.test.ts:178-232
  //     (builds the real build path and snapshot consumer over the same
  //     source, asserts matching TYPE_MISMATCH)
  //   - packages/analysis/src/__tests__/constraint-applicability.test.ts
  //     describe block "@const IR-check parity (analyzeConstraintTargets vs
  //     _checkConstValueAgainstType)" — direct comparison of the two IR-check
  //     implementations over matching ts.Type / TypeNode pairs.
  // -------------------------------------------------------------------------
  {
    label: '@const "USD" on string',
    tagName: "const",
    subjectType: "string",
    tagArgument: '"USD"',
  },

  // Enum membership: @const on string-literal unions (Panel Fix #6).
  // These exercise the snapshot consumer's enum classifier, and — via the
  // build-path proxy — the `_checkConstValueAgainstType` enum branch. They
  // also regression-test the nullable-union fix for the classifier (Fix #1):
  // `"USD" | "EUR" | null` has two non-nullish members so stripNullishUnion
  // does not collapse it; the classifier must filter nullish members.
  {
    label: '@const "USD" on string-literal union',
    tagName: "const",
    subjectType: '"USD" | "EUR"',
    tagArgument: '"USD"',
  },
  {
    label: '@const "XYZ" on string-literal union (membership fail)',
    tagName: "const",
    subjectType: '"USD" | "EUR"',
    tagArgument: '"XYZ"',
  },
  {
    label: '@const "USD" on nullable string-literal union',
    tagName: "const",
    subjectType: '"USD" | "EUR" | null',
    tagArgument: '"USD"',
  },
  {
    label: "@const true on nullable boolean",
    tagName: "const",
    subjectType: "boolean | null",
    tagArgument: "true",
  },

  // -------------------------------------------------------------------------
  // @uniqueItems
  // -------------------------------------------------------------------------
  {
    label: "@uniqueItems on string[]",
    tagName: "uniqueItems",
    subjectType: "string[]",
    tagArgument: "",
  },
  {
    label: "@uniqueItems on string",
    tagName: "uniqueItems",
    subjectType: "string",
    tagArgument: "",
  },

  // -------------------------------------------------------------------------
  // Alias-chain propagation (load-bearing: §9.1 #1)
  //
  // NN has @minimum 0 on the base alias; P derives from NN.
  // A field of type P with @maximum 100 should produce BOTH constraints in the
  // canonical IR. This fixture verifies that alias-chain inheritance remains
  // intact through the refactor — it is NOT a divergence test but a
  // regression guard for the inheritance path itself.
  // -------------------------------------------------------------------------
  {
    label: "alias-chain: @maximum 100 on derived alias (P = NN = number, @minimum 0 on NN)",
    tagName: "maximum",
    subjectType: "P",
    tagArgument: "100",
    preamble: ["/** @minimum 0 */", "type NN = number;", "type P = NN;"].join("\n"),
  },

  // -------------------------------------------------------------------------
  // §3 known-divergence cases — these SHOULD appear in KNOWN_DIVERGENCES above
  // -------------------------------------------------------------------------

  // @const not-json: build passes quoted string; snapshot omits argument
  {
    label: "@const not-json string",
    tagName: "const",
    subjectType: "string",
    tagArgument: "not-json",
  },

  // @minimum Infinity: build stringifies; snapshot passes through as identifier
  {
    label: "@minimum Infinity on number",
    tagName: "minimum",
    subjectType: "number",
    tagArgument: "Infinity",
  },

  // @minimum NaN: build stringifies; snapshot passes through as identifier
  {
    label: "@minimum NaN on number",
    tagName: "minimum",
    subjectType: "number",
    tagArgument: "NaN",
  },

  // -------------------------------------------------------------------------
  // Guard-order parity pin (Fix #1): @minimum "hello" on string
  //
  // Both consumers should emit TYPE_MISMATCH (Role B wins — string has no
  // numeric-comparable capability) before the argument type is checked.
  // If the snapshot consumer runs Role C (typed parser) before Role B, it
  // emits INVALID_TAG_ARGUMENT instead of TYPE_MISMATCH, creating a
  // diagnostic-code divergence. This fixture pins the correct order.
  // -------------------------------------------------------------------------
  {
    label: '@minimum "hello" on string (guard-order parity: Role B before Role C)',
    tagName: "minimum",
    subjectType: "string",
    tagArgument: '"hello"',
  },

  // -------------------------------------------------------------------------
  // Role-A/B ordering pin: @minimum on type-alias string (misplaced + type-incompatible)
  //
  // `@minimum` has FIELD_PLACEMENTS only; `type-alias` is not a valid
  // placement. The subject type is `string` (no numeric-comparable capability),
  // making this both misplaced AND type-incompatible.
  //
  // After the Role-A ordering fix, BOTH consumers must emit
  // INVALID_TAG_PLACEMENT (Role A wins). Before the fix, the snapshot consumer
  // ran Role B first and emitted TYPE_MISMATCH, while the build consumer
  // already ran Role A first and emitted INVALID_TAG_PLACEMENT — a real
  // diagnostic-code divergence that this fixture pins to never recur.
  // -------------------------------------------------------------------------
  {
    label:
      "@minimum 0 on type-alias string (Role-A/B order pin: misplaced + type-incompatible)",
    tagName: "minimum",
    subjectType: "string",
    tagArgument: "0",
    targetDeclaration: "type-alias",
  },
];

// ---------------------------------------------------------------------------
// Source generation helpers
// ---------------------------------------------------------------------------

/**
 * Generates the TypeScript source for a single fixture.
 *
 * The generated source wraps the field in a class named `TestClass`. For
 * optional types (`number | undefined`), a `?` modifier is added so the
 * TypeScript compiler resolves the subject type correctly.
 *
 * When `fixture.targetDeclaration === "type-alias"`, the tag is placed on a
 * top-level type alias named `MyType` instead of a class field, to exercise
 * `type-alias` placement for misplacement tests.
 */
function generateFixtureSource(fixture: ParityFixture): string {
  const { tagName, subjectType, tagArgument, preamble } = fixture;
  // Build the doc comment: @tagName [tagArgument]
  const tagLine = tagArgument.trim() === "" ? `@${tagName}` : `@${tagName} ${tagArgument}`;
  const comment = `/** ${tagLine} */`;

  const preamblePart = preamble !== undefined ? `${preamble}\n\n` : "";

  if (fixture.targetDeclaration === "type-alias") {
    // Tag on a type alias — yields `type-alias` placement.
    return `${preamblePart}${comment}\ntype MyType = ${subjectType};\n`;
  }

  // Detect optional: `number | undefined` → use `?` modifier with `number`
  const isOptional = subjectType.includes("| undefined") || subjectType.includes("undefined |");
  const declaredType = isOptional
    ? subjectType
        .replace(/\s*\|\s*undefined\s*/g, "")
        .replace(/\s*undefined\s*\|\s*/g, "")
        .trim()
    : subjectType;
  const fieldDecl = isOptional
    ? `  ${comment}\n  field?: ${declaredType};`
    : `  ${comment}\n  field!: ${declaredType};`;

  return `${preamblePart}class TestClass {\n${fieldDecl}\n}\n`;
}

// ---------------------------------------------------------------------------
// Consumer runners
// ---------------------------------------------------------------------------

/**
 * Runs the SNAPSHOT consumer on the fixture's source text and returns the
 * full list of {@link FormSpecAnalysisDiagnostic} emitted for the file.
 */
function runSnapshotConsumer(fixture: ParityFixture): FormSpecAnalysisDiagnostic[] {
  const source = generateFixtureSource(fixture);
  const { checker, sourceFile } = createProgram(source);
  const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
  return [...snapshot.diagnostics];
}

interface BuildConsumerResult {
  readonly hasDiagnostic: boolean;
  readonly diagnosticCode: string | undefined;
  readonly diagnosticMessage: string | undefined;
  readonly subjectTypeKind: string;
  readonly placement: string;
}

/**
 * Runs the BUILD consumer proxy on the fixture's source text.
 *
 * Finds the `field` property on `TestClass`, resolves its subject type, and
 * calls {@link checkSyntheticTagApplication} with arguments prepared via
 * {@link renderBuildArgumentExpressionProxy} (the build-path lowering function).
 *
 * Returns a structured result suitable for conversion to a
 * {@link ParityLogEntry}.
 */
function runBuildConsumer(fixture: ParityFixture): BuildConsumerResult {
  const source = generateFixtureSource(fixture);
  const { checker, sourceFile } = createProgram(source);

  let targetNode: ts.Node | undefined;

  if (fixture.targetDeclaration === "type-alias") {
    // Locate the 'MyType' type alias declaration for type-alias placement fixtures.
    const visit = (node: ts.Node): void => {
      if (ts.isTypeAliasDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "MyType") {
        targetNode = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (targetNode === undefined) {
      throw new Error(
        `Invariant violation: generated parity fixture source is missing the 'MyType' type alias for tag '${fixture.tagName}'.`
      );
    }
  } else {
    // Locate the 'field' property declaration inside TestClass
    let fieldNode: ts.PropertyDeclaration | undefined;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "field"
      ) {
        fieldNode = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    if (fieldNode === undefined) {
      // generateFixtureSource always emits a `field` property, so reaching here
      // indicates an AST traversal bug rather than a valid "no field" scenario.
      throw new Error(
        `Invariant violation: generated parity fixture source is missing the 'field' property for tag '${fixture.tagName}'.`
      );
    }
    targetNode = fieldNode;
  }

  const subjectType = getSubjectType(targetNode, checker);
  const placement = resolveDeclarationPlacement(targetNode);
  const subjectTypeKind =
    subjectType !== undefined ? describeTypeKind(subjectType, checker) : "unknown";
  const resolvedPlacement = placement ?? "class-field";

  // Get tag definition to retrieve semantic metadata for the role checks below.
  const definition = getTagDefinition(fixture.tagName);

  // §5 Phase 5C — the build-path proxy now runs Role A (placement pre-check)
  // + Role B (capability guard) + @const IR check + Role C (typed parser),
  // matching the real build path after the synthetic retirement. Previously
  // this function also lowered the argument into a synthetic call expression
  // and compiled a supporting declarations preamble; both steps are gone.
  let hasDiagnostic = false;
  let diagnosticCode: string | undefined;
  let diagnosticMessage: string | undefined;

  // Role A — apply the placement pre-check that the real build path applies via
  // `definition.placements.includes(placement)` in `tsdoc-parser.ts` (~line
  // 482). ORDERING: Role A runs BEFORE Role B (capability guard). For a
  // builtin constraint that is BOTH misplaced AND type-incompatible, both
  // consumers must emit `INVALID_TAG_PLACEMENT` (Role A wins). Running Role B
  // first would produce `TYPE_MISMATCH`, causing a parity divergence.
  //
  // Parity fixtures use direct-field targets only (no path/member targets),
  // so targetKind is always null here.
  if (definition !== null) {
    const matchingSignatures = getMatchingTagSignatures(definition, resolvedPlacement, null);
    if (matchingSignatures.length === 0) {
      hasDiagnostic = true;
      diagnosticCode = "INVALID_TAG_PLACEMENT";
      diagnosticMessage = `No synthetic signature for @${definition.canonicalName} on placement "${resolvedPlacement}"`;
    }
  }

  // Role B — apply the capability guard that the real build path applies via
  // `supportsConstraintCapability()` in `tsdoc-parser.ts`. The snapshot
  // consumer also applies this check after Role A, so the proxy must mirror
  // the same order for parity to be meaningful. Only applies to direct-field
  // (no target).
  if (!hasDiagnostic && subjectType !== undefined && definition !== null) {
    const requiredCapability = definition.capabilities[0];
    if (
      requiredCapability !== undefined &&
      !_supportsConstraintCapability(requiredCapability, subjectType, checker)
    ) {
      hasDiagnostic = true;
      diagnosticCode = "TYPE_MISMATCH";
      diagnosticMessage = `constraint "@${fixture.tagName}" capability check failed (Role B)`;
    }
  }

  // §5 Phase 5B — mirror the @const IR validation that the real build path
  // applies via `validateIR` in `semantic-targets.ts` (`case "const":` ~line
  // 1255). The snapshot consumer now runs `_checkConstValueAgainstType` in
  // `buildTagDiagnostics`, so this proxy must mirror it or every fixture
  // where the field type is not primitive/enum — and every primitive-kind
  // mismatch — would spuriously flag as a parity divergence.
  //
  // Scope: only @const with a successful typed-parser parse. Matches the
  // snapshot consumer's scope (case "const" in buildTagDiagnostics after
  // Role-C C-pass). Parity fixtures use direct-field targets only.
  if (!hasDiagnostic && subjectType !== undefined && fixture.tagName === "const") {
    const typedResult = parseTagArgument("const", fixture.tagArgument, "build");
    if (
      typedResult.ok &&
      (typedResult.value.kind === "json-value" || typedResult.value.kind === "raw-string-fallback")
    ) {
      const constCheck = _checkConstValueAgainstType(typedResult.value.value, subjectType, checker);
      if (constCheck !== null) {
        hasDiagnostic = true;
        diagnosticCode = constCheck.code;
        diagnosticMessage = constCheck.message;
      }
    }
  }

  // §5 Phase 5C — the synthetic TypeScript program batch has been retired.
  // The build-path proxy now runs Role C via `parseTagArgument` directly, the
  // same gate the real build path uses after Slice C. Role A / Role B /
  // `@const` IR check above mirror the real build path's earlier gates.
  if (!hasDiagnostic) {
    const typedResult = parseTagArgument(fixture.tagName, fixture.tagArgument, "build");
    if (!typedResult.ok) {
      hasDiagnostic = true;
      diagnosticCode = typedResult.diagnostic.code;
      diagnosticMessage = typedResult.diagnostic.message;
    }
  }

  return {
    hasDiagnostic,
    diagnosticCode,
    diagnosticMessage,
    subjectTypeKind,
    placement: resolvedPlacement,
  };
}

/**
 * Derives a role outcome for the build consumer based on diagnostic presence
 * and code.
 *
 * Phase 5A: Role-B capability failures are mapped to "C-reject" in the parity
 * model to match the snapshot consumer's mapping (both emit TYPE_MISMATCH;
 * the exact role label — B vs C — is not semantically significant for parity
 * detection). The important thing is that both consumers agree on whether a
 * diagnostic is produced and what its code is.
 */
function deriveBuildRoleOutcome(result: BuildConsumerResult): RoleOutcome {
  if (!result.hasDiagnostic) {
    return "C-pass";
  }
  if (result.diagnosticCode === "INVALID_TAG_PLACEMENT") {
    return "A-reject";
  }
  return "C-reject";
}

/**
 * Derives a role outcome for the snapshot consumer based on a diagnostic code.
 */
function deriveSnapshotRoleOutcome(code: string): RoleOutcome {
  switch (code) {
    case "INVALID_TAG_PLACEMENT":
      return "A-reject";
    case "UNKNOWN_PATH_TARGET":
    case "INVALID_PATH_TARGET":
      return "B-reject";
    default:
      return "C-reject";
  }
}

// ---------------------------------------------------------------------------
// ParityLogEntry conversion
// ---------------------------------------------------------------------------

/**
 * Converts a build-consumer proxy result to a {@link ParityLogEntry}.
 */
function buildResultToEntry(fixture: ParityFixture, result: BuildConsumerResult): ParityLogEntry {
  return {
    consumer: "build",
    tag: fixture.tagName,
    placement: result.placement,
    subjectTypeKind: result.subjectTypeKind,
    roleOutcome: deriveBuildRoleOutcome(result),
    elapsedMicros: 0,
    ...(result.hasDiagnostic && result.diagnosticCode !== undefined
      ? {
          diagnostic: {
            code: result.diagnosticCode,
            message: result.diagnosticMessage ?? "",
          },
        }
      : {}),
  };
}

/**
 * Converts snapshot consumer diagnostics to {@link ParityLogEntry} objects.
 *
 * Each unique `(tag, placement, subjectTypeKind)` combination becomes one
 * entry. If the snapshot produced no diagnostic for this fixture's tag, a
 * pass entry is emitted.
 */
function snapshotDiagnosticsToEntries(
  fixture: ParityFixture,
  diagnostics: FormSpecAnalysisDiagnostic[],
  placement: string,
  subjectTypeKind: string
): ParityLogEntry[] {
  // Filter to diagnostics that carry our fixture's tag in their data.
  //
  // Global/setup diagnostics emitted by the batch checker use `data.tagNames`
  // (plural array) rather than `data.tagName` (singular string). These are
  // not scoped to a single fixture tag and must NOT be attributed to every
  // fixture — returning `false` here prevents false parity divergences caused
  // by setup-level failures being treated as per-fixture diagnostics.
  const tagDiagnostics = diagnostics.filter((d) => {
    const tagName = "tagName" in d.data ? d.data["tagName"] : undefined;
    if (typeof tagName === "string") {
      return tagName === fixture.tagName;
    }
    // Check for the plural tagNames field used by global/setup diagnostics.
    const tagNames = "tagNames" in d.data ? d.data["tagNames"] : undefined;
    if (Array.isArray(tagNames)) {
      return tagNames.includes(fixture.tagName);
    }
    // Diagnostics without explicit tag scoping should not be attributed to a
    // specific fixture in this per-fixture parity model.
    return false;
  });

  if (tagDiagnostics.length === 0) {
    // No diagnostic for this tag — pass entry
    return [
      {
        consumer: "snapshot",
        tag: fixture.tagName,
        placement,
        subjectTypeKind,
        roleOutcome: "C-pass",
        elapsedMicros: 0,
      },
    ];
  }

  // Take the first diagnostic (per-tag, one entry in the parity model)
  const firstDiag = tagDiagnostics[0];
  if (firstDiag === undefined) {
    return [
      {
        consumer: "snapshot",
        tag: fixture.tagName,
        placement,
        subjectTypeKind,
        roleOutcome: "C-pass",
        elapsedMicros: 0,
      },
    ];
  }

  return [
    {
      consumer: "snapshot",
      tag: fixture.tagName,
      placement,
      subjectTypeKind,
      roleOutcome: deriveSnapshotRoleOutcome(firstDiag.code),
      elapsedMicros: 0,
      diagnostic: {
        code: firstDiag.code,
        message: firstDiag.message,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Known-divergence matcher
// ---------------------------------------------------------------------------

/**
 * Returns true when `divergence` matches a known-divergence entry for the
 * given `fixtureLabel`.
 */
function isKnownDivergence(fixtureLabel: string, divergence: ParityDivergence): boolean {
  return KNOWN_DIVERGENCES.some(
    (kd) =>
      kd.fixtureLabel === fixtureLabel &&
      (kd.divergenceKind === "any" || kd.divergenceKind === divergence.kind)
  );
}

// ---------------------------------------------------------------------------
// Parity harness test suite
// ---------------------------------------------------------------------------

describe("cross-consumer parity harness (Phase 0.5a)", () => {
  for (const fixture of FIXTURES) {
    it(`fixture: ${fixture.label}`, () => {
      // -----------------------------------------------------------------------
      // 1. Run both consumers
      // -----------------------------------------------------------------------
      const snapshotDiagnostics = runSnapshotConsumer(fixture);
      const buildResult = runBuildConsumer(fixture);

      // -----------------------------------------------------------------------
      // 2. Derive type-info for the snapshot entry from the build result
      //    (both ran against the same source, so placement/kind are the same)
      // -----------------------------------------------------------------------
      const { placement, subjectTypeKind } = buildResult;

      // -----------------------------------------------------------------------
      // 3. Convert to ParityLogEntry slices
      // -----------------------------------------------------------------------
      const buildEntries: ParityLogEntry[] = [buildResultToEntry(fixture, buildResult)];
      const snapshotEntries: ParityLogEntry[] = snapshotDiagnosticsToEntries(
        fixture,
        snapshotDiagnostics,
        placement,
        subjectTypeKind
      );

      // -----------------------------------------------------------------------
      // 4. Diff
      // -----------------------------------------------------------------------
      const diffs = diffParityLogs(buildEntries, snapshotEntries);

      // -----------------------------------------------------------------------
      // 5. Assert: every divergence must be in KNOWN_DIVERGENCES
      // -----------------------------------------------------------------------
      const unexplainedDivergences = diffs.filter((d) => !isKnownDivergence(fixture.label, d));

      if (unexplainedDivergences.length > 0) {
        // Produce a descriptive failure with the actual divergences so the root
        // cause is immediately obvious without consulting source code.
        const descriptions = unexplainedDivergences.map((d): string => {
          switch (d.kind) {
            case "role-outcome-divergence":
              return (
                `  role-outcome-divergence at key "${d.key}": ` +
                `build="${d.buildOutcome}" snapshot="${d.snapshotOutcome}"`
              );
            case "diagnostic-code-divergence":
              return (
                `  diagnostic-code-divergence at key "${d.key}": ` +
                `build="${String(d.buildCode)}" snapshot="${String(d.snapshotCode)}"`
              );
            case "missing-in-snapshot":
              return `  missing-in-snapshot at key "${d.key}": build has entry, snapshot does not`;
            case "missing-in-build":
              return `  missing-in-build at key "${d.key}": snapshot has entry, build does not`;
          }
        });

        throw new Error(
          `Fixture "${fixture.label}" produced unexpected divergences between ` +
            `build and snapshot consumers:\n${descriptions.join("\n")}\n\n` +
            `If this is intentional, add an entry to KNOWN_DIVERGENCES in ` +
            `parity-harness.test.ts citing the relevant §3 catalogue entry.`
        );
      }

      // Passed: either zero divergences, or all divergences are known.
      expect(unexplainedDivergences).toHaveLength(0);
    });
  }

  // -------------------------------------------------------------------------
  // Meta-test: every KNOWN_DIVERGENCES entry has a corresponding fixture
  // -------------------------------------------------------------------------
  it("meta: every KNOWN_DIVERGENCES entry references an existing fixture label", () => {
    const fixtureLabels = new Set(FIXTURES.map((f) => f.label));
    for (const kd of KNOWN_DIVERGENCES) {
      expect(
        fixtureLabels.has(kd.fixtureLabel),
        `KNOWN_DIVERGENCES entry "${kd.fixtureLabel}" has no matching fixture. ` +
          `Either add the fixture or remove the stale known-divergence entry.`
      ).toBe(true);
    }
  });
});
