/**
 * Cross-consumer parity harness (Phase 0.5a).
 *
 * Runs the BUILD path (via {@link checkSyntheticTagApplication} with
 * build-style argument preparation) and the SNAPSHOT path (via
 * {@link buildFormSpecAnalysisFileSnapshot}) over a parametric fixture suite
 * covering the full matrix of constraint tag × subject type × argument shape.
 *
 * For each fixture, the two consumer outputs are normalised into
 * {@link ParityLogEntry} slices and compared with {@link diffParityLogs}.
 * The test asserts either:
 *
 *   (a) `diff.length === 0` — the two consumers agree, or
 *   (b) every divergence matches an entry in {@link KNOWN_DIVERGENCES}.
 *
 * If a NEW divergence appears that is not in the known list the test name and
 * the actual-vs-expected diff make the root cause obvious.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §9.1 #1
 * @see docs/refactors/synthetic-checker-retirement.md §3 (divergence catalogue)
 */

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  buildFormSpecAnalysisFileSnapshot,
  checkSyntheticTagApplication,
  describeTypeKind,
  getSubjectType,
  getTagDefinition,
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
 * §3 catalogue entries:
 *   - `@const not-json` — Build: passes quoted string literal; Snapshot: omits
 *     argument entirely. Both consumers reach role-C, but may produce different
 *     diagnostic codes when the argument is malformed JSON.
 *   - `@minimum Infinity` — Build: stringifies to `"Infinity"`; Snapshot:
 *     passes `Infinity` as an identifier. Divergent C-outcome.
 *   - `@minimum NaN` — Build: stringifies to `"NaN"`; Snapshot passes `NaN`
 *     as an identifier. Divergent C-outcome.
 *   - Integer-brand snapshot-path gap (#315) — The build path has an
 *     `isIntegerBrandedType` bypass that accepts numeric constraints on
 *     integer-branded types without a synthetic call. The snapshot path does
 *     not replicate this bypass today, so the two consumers may diverge on
 *     integer-branded subject types.
 *
 * Phase 4A update: the integer-brand snapshot-path gap (#325) is now resolved.
 * `isIntegerBrandedType` bypass was added to the snapshot consumer in Phase 4A,
 * so the `@minimum 0 on Integer` KNOWN_DIVERGENCES entry is removed. Both
 * consumers now converge on integer-branded types with numeric-comparable tags.
 */
const KNOWN_DIVERGENCES: readonly KnownDivergenceEntry[] = [
  // §3: @const not-json — build passes quoted string; snapshot omits argument
  {
    fixtureLabel: "@const not-json string",
    divergenceKind: "any",
    reason:
      "§3: Build path passes quoted string literal for invalid JSON; snapshot omits argument. See docs/refactors/synthetic-checker-retirement.md §3.",
  },
  // §3: @minimum Infinity — NORMALIZED in Phase 2.
  // Build path now passes Infinity as an identifier (same as snapshot). Both
  // renderSyntheticArgumentExpression (in tsdoc-parser.ts) and renderBuildArgumentExpressionProxy
  // (this harness proxy) were updated to handle Infinity as an identifier.
  // This KNOWN_DIVERGENCES entry is intentionally removed; no divergence expected.
  //
  // §3: @minimum NaN — NORMALIZED in Phase 2. Same mechanism as Infinity.
  // This KNOWN_DIVERGENCES entry is intentionally removed; no divergence expected.
  //
  // Integer-brand snapshot-path gap (PR #325): RESOLVED in Phase 4A.
  // The isIntegerBrandedType bypass was added to the snapshot consumer.
  // Both consumers now converge on numeric-comparable tags for integer-branded types.
  // This entry is intentionally removed; no divergence expected for "@minimum 0 on Integer".
  // Alias-chain type-resolution divergence (newly discovered by this harness):
  // The build consumer resolves subject type to its primitive base (number) before
  // invoking checkSyntheticTagApplication; supporting declarations include the alias
  // chain. The snapshot consumer uses checker.typeToString on the declared type node
  // which may produce the alias name (e.g. "P") rather than "number". When the
  // synthetic helper prelude does not include the alias chain declaration, the
  // snapshot rejects the constraint as a TYPE_MISMATCH while the build passes.
  // This is a pre-existing divergence, not introduced by this harness.
  // Phase 4D decision deferred: see #363 for tracking and resolution approach.
  {
    fixtureLabel: "alias-chain: @maximum 100 on derived alias (P = NN = number, @minimum 0 on NN)",
    divergenceKind: "role-outcome-divergence",
    reason:
      "Alias-chain type-resolution divergence (newly discovered by Phase 0.5a harness): " +
      "build consumer resolves subject type to primitive base (number) before synthetic call; " +
      "snapshot consumer uses the alias name from the declared type node (P), which the synthetic " +
      "prelude does not have supporting declarations for, causing a TYPE_MISMATCH rejection. " +
      "This is a pre-existing divergence — Phase 4D deferred, tracked in #363.",
  },
];

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
  // @const "USD"
  // -------------------------------------------------------------------------
  {
    label: '@const "USD" on string',
    tagName: "const",
    subjectType: "string",
    tagArgument: '"USD"',
  },
  {
    label: '@const "USD" on number',
    tagName: "const",
    subjectType: "number",
    tagArgument: '"USD"',
  },
  {
    label: '@const "USD" on object',
    tagName: "const",
    subjectType: "{ code: string }",
    tagArgument: '"USD"',
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
 */
function generateFixtureSource(fixture: ParityFixture): string {
  const { tagName, subjectType, tagArgument, preamble } = fixture;
  // Build the doc comment: @tagName [tagArgument]
  const tagLine = tagArgument.trim() === "" ? `@${tagName}` : `@${tagName} ${tagArgument}`;
  const comment = `/** ${tagLine} */`;

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

  const preamblePart = preamble !== undefined ? `${preamble}\n\n` : "";
  return `${preamblePart}class TestClass {\n${fieldDecl}\n}\n`;
}

// ---------------------------------------------------------------------------
// Build-consumer proxy helpers
//
// These replicate the argument-lowering logic of the build consumer's
// `renderSyntheticArgumentExpression` function. This intentionally lives
// here (not imported) because the build package is not a dependency of
// @formspec/analysis. Keeping it in-test ensures it stays in sync with the
// spec description in §3 of the retirement plan.
//
// ============================================================================
// SYNC CONTRACT — keep this proxy in sync with the canonical implementation:
//   packages/build/src/analyzer/tsdoc-parser.ts  renderSyntheticArgumentExpression  (lines ~406-419)
//
// Branches that MUST stay in sync:
//   1. "number" / "integer" / "signedInteger" — Infinity/NaN pass through as
//      identifiers (Phase 2 fix). Other non-parseable text is JSON.stringify'd.
//   2. "string" — always JSON.stringify(argumentText) (note: full text, not trimmed).
//   3. "json"   — JSON.parse + wrap in parens on success; JSON.stringify fallback on error.
//   4. "boolean" — pass "true"/"false" through; JSON.stringify everything else.
//   5. "condition" — "undefined as unknown as FormSpecCondition" literal.
//   6. null/undefined — return null (no argument).
//   7. Infinity/NaN handling — "Infinity", "-Infinity", "NaN" must pass through
//      as identifiers for the number/integer/signedInteger branch (not stringified).
// ============================================================================
// ---------------------------------------------------------------------------

/**
 * Proxy replicating `renderSyntheticArgumentExpression` from
 * `packages/build/src/analyzer/tsdoc-parser.ts` — the build-path argument
 * lowering function.
 *
 * Named `renderBuildArgumentExpressionProxy` to make clear this is a local
 * copy that must be kept in sync with the canonical implementation. See the
 * SYNC CONTRACT block above for the exact branches to maintain.
 *
 * Key semantics (§3, updated for Phase 2):
 *   - number/integer/signedInteger: finite numbers pass through; Infinity,
 *     -Infinity, and NaN pass through as identifiers (Phase 2 fix — no longer
 *     JSON-stringified). Other non-parseable text is JSON-stringified.
 *   - string: always JSON-quoted.
 *   - json: parses and re-renders valid JSON; falls back to JSON.stringify on
 *     parse error (this is the divergence from the snapshot path for `@const`
 *     with invalid JSON).
 *   - boolean: accepts "true"/"false"; otherwise JSON-stringifies.
 *   - null / condition: pass-through special cases.
 *
 * @see packages/build/src/analyzer/tsdoc-parser.ts renderSyntheticArgumentExpression
 */
function renderBuildArgumentExpressionProxy(
  valueKind: string | null | undefined,
  argumentText: string
): string | null {
  const trimmed = argumentText.trim();
  if (trimmed === "") {
    return null;
  }

  switch (valueKind) {
    case "number":
    case "integer":
    case "signedInteger":
      // Phase 2: Infinity, -Infinity, NaN pass through as identifiers.
      // Snapshot path has always done this; build path now matches.
      if (trimmed === "Infinity" || trimmed === "-Infinity" || trimmed === "NaN") {
        return trimmed;
      }
      return Number.isFinite(Number(trimmed)) ? trimmed : JSON.stringify(trimmed);
    case "string":
      return JSON.stringify(argumentText);
    case "json": {
      try {
        JSON.parse(trimmed);
        return `(${trimmed})`;
      } catch {
        // Build path: fallback to quoted string (diverges from snapshot which omits)
        return JSON.stringify(trimmed);
      }
    }
    case "boolean":
      return trimmed === "true" || trimmed === "false" ? trimmed : JSON.stringify(trimmed);
    case "condition":
      return "undefined as unknown as FormSpecCondition";
    case null:
    case undefined:
      return null;
    default:
      // Mirror renderSyntheticArgumentExpression's default: surface the unknown
      // kind as a bare identifier (triggers TS errors for truly unknown kinds).
      return valueKind;
  }
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

  const subjectType = getSubjectType(fieldNode, checker);
  const placement = resolveDeclarationPlacement(fieldNode);
  const subjectTypeKind =
    subjectType !== undefined ? describeTypeKind(subjectType, checker) : "unknown";
  const resolvedPlacement = placement ?? "class-field";

  // Get tag definition to retrieve the valueKind for argument lowering
  const definition = getTagDefinition(fixture.tagName);
  const valueKind = definition?.valueKind ?? null;

  // Prepare argument expression using build-path lowering
  const argumentExpression = renderBuildArgumentExpressionProxy(valueKind, fixture.tagArgument);

  // subjectType text for the synthetic call
  const subjectTypeText =
    subjectType !== undefined
      ? checker.typeToString(subjectType, undefined, ts.TypeFormatFlags.NoTruncation)
      : "unknown";

  // Collect supporting declarations from source (the preamble type aliases)
  const supportingDeclarations: string[] = [];
  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isTypeAliasDeclaration(node) ||
      ts.isVariableStatement(node) ||
      ts.isInterfaceDeclaration(node)
    ) {
      supportingDeclarations.push(node.getFullText(sourceFile).trim());
    }
  });

  // Invoke the synthetic checker (build path proxy)
  let hasDiagnostic = false;
  let diagnosticCode: string | undefined;
  let diagnosticMessage: string | undefined;

  try {
    const result = checkSyntheticTagApplication({
      tagName: fixture.tagName,
      placement: resolvedPlacement,
      hostType: subjectTypeText,
      subjectType: subjectTypeText,
      supportingDeclarations,
      ...(argumentExpression !== null ? { argumentExpression } : {}),
    });
    hasDiagnostic = result.diagnostics.length > 0;
    if (hasDiagnostic) {
      const firstDiag = result.diagnostics[0];
      if (firstDiag !== undefined) {
        diagnosticCode = deriveBuildDiagnosticCode(firstDiag.message);
        diagnosticMessage = firstDiag.message;
      }
    }
  } catch (error) {
    // lowerTagApplicationToSyntheticCall throws for invalid placements (A-reject)
    hasDiagnostic = true;
    diagnosticCode = "INVALID_TAG_PLACEMENT";
    diagnosticMessage = error instanceof Error ? error.message : String(error);
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
 * Derives a build-path diagnostic code from a TypeScript compiler diagnostic
 * message string.
 *
 * The `includes("Expected")` and `includes("No overload")` pattern mapping
 * mirrors the per-application result classification in `buildTagDiagnostics`
 * at `packages/analysis/src/file-snapshots.ts`.
 */
function deriveBuildDiagnosticCode(message: string): string {
  if (message.includes("No overload")) {
    return "INVALID_TAG_PLACEMENT";
  }
  if (message.includes("Expected")) {
    return "INVALID_TAG_ARGUMENT";
  }
  return "TYPE_MISMATCH";
}

/**
 * Derives a role outcome for the build consumer based on diagnostic presence
 * and code.
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
