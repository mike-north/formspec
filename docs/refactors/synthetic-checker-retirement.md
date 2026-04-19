# Refactor Plan — Retire the Synthetic Checker (v6)

**Status:** planning document (no code changes proposed in this file). v6 adds an explicit §8 Success criteria section covering behavioral, performance/memory, observability (debug logging), and the named Stripe `Ref<Customer>` stress-test acceptance gate. Phase 0.5 gains fixtures 0.5l (Stripe stress test baseline) and 0.5m (parity-harness log schema); Phase 0 now builds out the §8.3 structured-logging deliverable as a required artifact, not a nice-to-have.
**Scope:** consolidate constraint-tag validation on the host `ts.Program` and eliminate (or radically minimize) the in-memory synthetic program created in `packages/analysis/src/compiler-signatures.ts`.

**Non-goal (explicit):** this refactor preserves current diagnostic semantics bit-for-bit *for every input that both consumers currently handle identically*. Inputs where build and snapshot already diverge today (see §3 table) stay divergent through the refactor — they are addressed in a separate, named "normalization PR" that lands after the refactor completes. This is the only way to keep the non-goal honest.

---

## 1. Current state (what we're replacing)

### 1.1 The synthetic program

- Entry point: `runSyntheticProgram` in `packages/analysis/src/compiler-signatures.ts:968-1006`.
- Mechanism: virtual file `/virtual/formspec-synthetic-batch.ts` + custom `CompilerHost` + `ts.createProgram` + `getPreEmitDiagnostics`.
- Source text assembled in `buildSyntheticBatchSource` (line 834-867):
  1. Prelude (`buildSyntheticHelperPrelude`, line 545-585) declaring `FormSpecPlacement`, `FormSpecCapability`, `ProvidesCapability<T, C>`, `tag_*` stubs for every registered tag, **and `type <ExtensionTypeName> = unknown;` aliases for every registered custom type**.
  2. Supporting declarations scraped from the user's file (`buildSupportingDeclarations`, `tsdoc-parser.ts:203-233`), with imports rewritten to `unknown` (path fixed/extended by #294, #297).
  3. Per-application namespace: `type __Host = ...; type __Subject = ...;` + a synthetic call like `__formspec.tag_minimum(__ctx<"class-field", string, number>(), 10);`.

The prelude's `unknown` aliases are load-bearing: `buildSupportingDeclarations` *keeps* declarations that reference imported/extension type names specifically because those names resolve via the prelude. Removing the aliases without removing their consumers breaks the synthetic program.

### 1.2 Two synthetic consumers (not one)

v1 of this plan missed the second consumer.

| Site | Path | Role |
|---|---|---|
| Build analyzer | `buildCompilerBackedConstraintDiagnostics` at `packages/build/src/analyzer/tsdoc-parser.ts:669-899` | Per-field, per-tag validation inside `parseTSDocTags` |
| File-snapshots batch | `packages/analysis/src/file-snapshots.ts:1240-1390` | Pre-batched synthetic applications for snapshot-driven analysis (ts-plugin / LSP); also produces the `TYPE_MISMATCH` / `UNKNOWN_PATH_TARGET` / `INVALID_TAG_ARGUMENT` / `INVALID_TAG_PLACEMENT` translation layer at line 1361-1390 |

Both reach `checkSyntheticTagApplications`/`lowerTagApplicationToSyntheticCall`. Both must migrate — or the snapshot path must continue to function while the build path migrates, and vice versa.

Additionally, `compiler-signatures.ts` itself exposes:

- `getMatchingTagSignatures` (line 403-411) — overload selection
- `lowerTagApplicationToSyntheticCall` (line 596-635) — target-kind rejection and synthetic call construction
- `checkNarrowSyntheticTagApplicability` / `checkNarrowSyntheticTagApplicabilities` (line 1245-1330) — a *narrow* applicability check (narrow prelude, no user declarations) with its own test coverage

These are not just "a synthetic program." They form a module whose public surface reaches beyond the build analyzer.

### 1.3 What runs on the host checker today (revised framing)

The v1 "~60% already on host checker" framing was overstated. A more accurate claim:

- **The build path's *gating* logic** (placement, path-target resolution, capability mismatch) already runs on the host `ts.TypeChecker` via `ts-binding.ts:hasTypeSemanticCapability` and `resolvePathTargetType` — see `tsdoc-parser.ts:698-708, 735-755, 797`.
- **But `parseTSDocTags` unconditionally calls `buildSupportingDeclarations`** at `tsdoc-parser.ts:984-989` before deciding whether a synthetic call will run. The prep work is not conditional on gating.
- **And `compiler-signatures.ts` machinery has not moved to host-checker APIs** at all; it remains entirely `ts.createProgram`-based.

So: the build-path host-checker path is well-established for *when* to reject a tag; the synthetic path still owns *how* the argument's type is validated.

### 1.4 Existing non-extension bypass: `isIntegerBrandedType`

`tsdoc-parser.ts:700-708` (and the fix in PR #294) short-circuits the synthetic path for imported/branded `Integer` types — independently of the extension registry. Regression tests live at `packages/build/src/__tests__/integer-type.test.ts:439-497` covering imported, nullable, optional, and mixed-field variants. This bypass is **not** part of the extension broadening system and has to be preserved or explicitly redesigned.

### 1.5 Four-and-a-half roles (revised decomposition)

| Role | What it does | Where today |
|------|---|---|
| A | Placement + tag-valid-here check | host checker / registry at `tsdoc-parser.ts:698-706` |
| B | Path-target resolution | host checker at `tsdoc-parser.ts:735-755` |
| C | Argument-literal type-check (is `10.5` a valid `@minLength` arg? is the regex a string?) | synthetic at `tsdoc-parser.ts:839` and `file-snapshots.ts:1355` |
| D1 | **Direct-field broadening** — a built-in tag on a custom-type field is transformed into a custom constraint via the extension's `parseValue` callback; emits a vendor-prefixed keyword rather than the standard one. Example: `@minimum 0` on a `Decimal` field → `"x-formspec-decimal-minimum": "0.0"`. See `tag-value-parser.ts:273-295` and `numeric-extension.integration.test.ts:61-81`. | IR layer + tag-value parser |
| D2 | **Path-target broadening** — stays a built-in constraint, emits the standard JSON Schema keyword on the path override. Different mechanism from D1. See `generate-schemas-config.test.ts:192-304`. | IR layer |

v1 conflated D1 and D2. They share the "broadening" name but have different code paths, different outputs, and different test surfaces.

### 1.6 Role C: what the synthetic *actually* enforces (and doesn't)

Codex review surfaced several semantics the plan must preserve — or explicitly change in a non-refactor PR:

1. **Integer erasure.** Both full and narrow preludes erase `integer`/`signedInteger` capability types to `number` (`compiler-signatures.ts:238-245, 280-286`). Today `@minLength 1.5` is accepted as an argument type because the prelude says "number." A typed parser that rejects non-integer values on integer tags is **a semantics change**, not a refactor.
2. **`@enumOptions` heterogeneity.** The current parser accepts `string`, `number`, and `{ id }` object forms, projecting to `members: (string | number)[]` (`tag-value-parser.ts:178-204`, `packages/core/src/types/ir.ts:420-426`). v1 characterized it as `string[]`, which is wrong.
3. **`@const`.** Validation is parse + IR-compatibility (`tag-value-parser.ts:151-176`, `semantic-targets.ts:1255-1298`), not captured under "argument-literal validation" in the usual sense. v1 omitted `@const` entirely.
4. **Raw-text recovery.** `TAGS_REQUIRING_RAW_TEXT` (`@pattern`, `@enumOptions`, `@defaultValue`) combines unified-parser spans with `ts.getJSDocTags()` fallback text, and **orphaned fallbacks are processed even when no parsed tag object exists** (`tsdoc-parser.ts:991-1056, 1152-1176`). Any replacement cannot take "raw text from one source" and call it done.

### 1.7 Downstream contract to preserve

- `parseTSDocTags` returns `TSDocParseResult` with `diagnostics: readonly ConstraintSemanticDiagnostic[]`.
- Consumed via `extractJSDocParseResult` (`jsdoc-constraints.ts:29-55`) into `IRClassAnalysis.diagnostics` (`class-analyzer.ts:173`).
- `file-snapshots.ts:1361-1390` has its own code-translation layer (`TYPE_MISMATCH` / `UNKNOWN_PATH_TARGET` / `INVALID_TAG_ARGUMENT` / `INVALID_TAG_PLACEMENT`) that maps TS diagnostic messages to FormSpec diagnostic codes. **Any replacement must produce codes and messages that match this mapping** or the snapshot-driven consumers (ts-plugin, LSP) regress.
- Downstream surfaces: CLI output, ESLint plugin, `@formspec/validator`, playground, IDE integrations.

### 1.8 Test surface (inventory)

Direct synthetic-path tests:
- `packages/build/src/__tests__/integer-type.test.ts` — 11 cases including PR #294/#297 cross-file scenarios and the `isIntegerBrandedType` bypass.
- `packages/build/src/__tests__/nounchecked-index-access.test.ts` — 4 cases for TS-compiler-option interactions.
- `packages/analysis/src/__tests__/compiler-signatures.test.ts` — 12+ cases: `MIXED_TAG_APPLICATIONS` (9 tag types), synthetic prelude generation, path-target lowering, placement rejection, narrow applicability.
- `packages/analysis/src/__tests__/tag-capability-applicability.test.ts` — exercises `checkNarrowSyntheticTagApplicability` specifically.

Broadening / extension tests:
- `packages/build/src/__tests__/numeric-extension.integration.test.ts` — D1 direct-field broadening into vendor-prefixed keywords.
- `packages/build/src/__tests__/extension-api.test.ts:142-602` — broadening registry + JSON Schema rejection rules.
- `packages/build/src/__tests__/generate-schemas-config.test.ts:192-460` — D2 path-target broadening + contradictions (e.g., `@pattern` on numeric Decimal path).

These are the spec. Nothing here changes; the new code path has to pass every one.

---

## 2. Target architecture

Two converging ambitions, clearly separated:

**Ambition 1 (refactor — no behavior change):** route constraint validation through a single pipeline per consumer (build vs. snapshot) that owns (A) placement, (B) path, (C) argument validation, and (D1/D2) broadening. Keep the `runSyntheticProgram` implementation underneath (C) for now if needed, but collapse the surface so the two consumers stop duplicating the lowering/translation machinery.

**Ambition 2 (architectural — some behavior changes):** replace role C's "type-check via synthesized TS program" with "typed argument parser + host-checker comparison," and consolidate D1/D2's dispatch so callers don't hand-route tags through two different code paths. This is where semantics preservation needs careful attention (§1.6).

Ambition 1 is a pure code-organization win. Ambition 2 is the strategic payoff but it's riskier.

### Architectural principle (candidate for ARCHITECTURE.md)

> Constraint validation reads the host program. Tag arguments are validated by a typed argument parser that preserves current semantics. A second `ts.Program` is never created at analysis time.

---

## 3. How argument validation (role C) actually migrates

Three mechanisms, ordered from safest to most invasive. The plan chooses them per-tag, not wholesale.

1. **Typed argument parser (preferred default).** Parse the raw tag text into a closed-sum `TagArgumentValue = NumberLit | StringLit | BooleanLit | RegexLit | JsonArrayLit | JsonObjectLit`. For each tag, check structural compatibility against the capability. **Preserve current integer erasure** — if the synthetic accepts `@minLength 1.5` today, the parser does too. This is a non-goal of the refactor to change.
2. **IR-level validation via `checkConstraintOnType`.** For tags whose meaning is fully expressible in IR capabilities, push the check to `@formspec/analysis:semantic-targets.ts:1134`. Covers constraints that don't actually need the raw argument type-checked.
3. **(Research spike, not a migration phase.)** Reuse the host `ts.TypeChecker` with a detached `ts.SourceFile` created by `ts.createSourceFile` for complex constructed expressions. Codex was right that no existing code path does this; it's uncharted. Do not commit to it as a phase. If the typed parser turns out to be insufficient for some future tag, evaluate this then.

Tag-by-tag coverage table:

| Tag | Proposed mechanism | Semantics-preservation notes |
|---|---|---|
| `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf` | #1 (NumberLit) | Preserve integer-erasure — no new rejections. **Tie-break `Infinity`/`NaN`** (see §6 risk 9). |
| `@minLength`, `@maxLength`, `@minItems`, `@maxItems` | #1 (NumberLit) | Preserve integer-erasure |
| `@uniqueItems` | #1 (boolean marker, `requiresArgument: false`, cf. `tag-registry.ts:158-183, 557-567`) | Current parser accepts empty or the literal `true` only; any other argument (including `false`) returns `null` — `tag-value-parser.ts:132-145`. Preserve exactly: marker-only with optional `true`, value always serialized as `true`. |
| `@pattern` | Raw string (opaque text), not a parsed RegexLit — matches current behavior at `tsdoc-parser.ts:311-312`, `tag-value-parser.ts:207-213`. | **Do not** run `new RegExp(text)` in Phase 2/3 — that is a new rejection. Defer regex validation to a separate opt-in improvement. |
| `@enumOptions` | #1 (JsonArrayLit); project strings/numbers/`{id}` objects per `tag-value-parser.ts:178-204` | Preserve heterogeneous union; do not restrict to `string[]` |
| `@const` | #1 (JSON scalar/array/object) with **raw-string fallback** on JSON-parse failure per `tag-value-parser.ts:151-176` and `tag-value-parser.test.ts:96-105`. IR compatibility check stays at `semantic-targets.ts:1255-1298`. | "Invalid JSON → raw string" is current behavior. Preserve. |

**Note on `@defaultValue`.** Codex v2 was right: `@defaultValue` is **not** on the synthetic constraint path. It's handled directly at `tsdoc-parser.ts:1060-1062, 1160-1162` and `file-snapshots.ts:685-699`, with its own raw-string fallback at `tag-value-parser.ts:216-229`. It is *outside* the scope of this refactor and should be listed only for completeness — no migration needed. If Phase 2/3 touches it, that's scope creep.

### Role C baseline is not singular — build and snapshot already diverge

Codex v2 surfaced a critical issue: the two synthetic consumers lower arguments differently.

- Build path: `renderSyntheticArgumentExpression` at `tsdoc-parser.ts:297-329` — invalid JSON becomes a quoted string literal; non-finite numbers are stringified.
- Snapshot path: `getArgumentExpression` at `file-snapshots.ts:896-927` — invalid JSON causes the argument to be *omitted*; non-finite numbers pass through unchanged.

These produce different diagnostics today. Concrete divergent inputs:

| Input | Build today | Snapshot today |
|---|---|---|
| `@const not-json` | Quoted string literal passed to synthetic | Argument omitted; different TS message |
| `@minimum Infinity` | Stringified "Infinity" | Passed through as `Infinity` identifier |
| `@minimum NaN` | Stringified "NaN" | Passed through as `NaN` identifier |

**The refactor does NOT normalize this divergence.** To keep the semantics-preservation claim honest, the typed-argument parser replicates whichever consumer is calling it — build callers get build semantics, snapshot callers get snapshot semantics — by parameterizing the parser with a small `lowering: "build" | "snapshot"` flag for the small set of divergent inputs. Post-refactor, a separate "normalization PR" picks one authority per divergent case with an explicit changelog entry. Scoping normalization out of the refactor is the only way the preservation claim remains true for every real-world call site.

### Role D split

- **D1 (direct-field):** dispatch in `tag-value-parser.ts:273-295` is correct today and doesn't need the synthetic program. It's already off the synthetic path. The refactor just has to avoid regressing it.
- **D2 (path-target):** currently converts to a standard built-in on the path override. Keep this mechanism; just ensure that when argument validation moves off the synthetic program, D2 still emits standard keywords.
- **`isIntegerBrandedType` bypass:** non-extension, non-registry; must survive the refactor or be replaced by an equivalent check before synthetic-callers are deleted. Add to the test-regression canary set.

---

## 4. Migration sequence (re-ordered)

v1 had an inversion bug (Phase 3 removed prelude aliases before their consumers were gone). v2 reorders so consumers go first, preludes go last.

1. **Phase 0 — observability and the snapshot-path audit.** Build out the structured logging deliverable from §8.3 (items 8.3a–8.3d at minimum) on top of the pino logger from #298. Use those same logs as the observability counters for: synthetic program invocations per call site (build vs. snapshot), per tag, per outcome (rejected at A/B, rejected at C, broadened away, D1, D2, bypass). Separately, map every consumer of `lowerTagApplicationToSyntheticCall` / `checkSyntheticTagApplications` / `checkNarrowSyntheticTagApplicability`. Confirm the only two Phase-1-relevant consumers are the build analyzer and `file-snapshots.ts`. Capture baseline metrics for §8.2 (wall time, peak RSS) and §8.4a (Stripe stress test baseline). This phase alone is worth landing even if the rest of the plan slips.
2. **Phase 0.5 — shore up the test surface (gate for Phase 2).** Execute every item in the §9.4 checklist. This phase is non-optional and blocks Phase 2 from landing. Deliverables, each as a separately-mergeable PR so test infrastructure ships before implementation:
   - **0.5a** Cross-consumer parity harness (§9.1 #1) — build vs. snapshot over a parametric fixture suite, asserting diagnostic equality or golden-divergence entry.
   - **0.5b** Three LSP/ts-plugin constraint fixtures added to existing harnesses (§9.1 #2).
   - **0.5c** Mirror `isIntegerBrandedType` cases in snapshot tests (§9.1 #3).
   - **0.5d** Span/provenance assertions for setup diagnostics (§9.1 #4).
   - **0.5e** `@const` raw-fallback edge cases (§9.1 #5).
   - **0.5f** Pinned tests for the three known build/snapshot divergences (§9.3 #16).
   - **0.5g** Orphaned raw-text fallback integration test (§9.3 #17).
   - **0.5h** Setup-diagnostic emission-count stability test (§9.3 #19).
   - **0.5i** Thin `constraint-tag-semantics.ref.md` with ~15 entries (§9.3 #12).
   - **0.5j** Silent-acceptance negative-case canaries (§9.3 #14).
   - **0.5k** Performance microbenchmark baseline (§9.2 #8) — captures pre-refactor numbers; Phase 4 must not regress.
   - **0.5l** Stripe `Ref<Customer>` stress-test fixture (§8.4) — build the fixture and record the Phase-0 baseline (peak RSS, wall time, whether it OOMs). The fixture itself requires PR #300 to have landed; if #300 is not yet merged, the fixture can be stubbed with a hand-authored `ts.Type`-observing custom type registration and migrated to `resolvePayload` once #300 lands.
   - **0.5m** Parity-harness structured log schema (§8.3e) — JSON shape definition plus a diffing helper consumed by 0.5a.
   - Items deferred past Phase 2: `@pattern` matrix (§9.2 #6), `@enumOptions` heterogeneous-form test (§9.2 #7), broadening + path-target contradiction combos (§9.2 #9), `tsconfig`-option matrix (§9.2 #10), PR #294 + #297 file-snapshots variant (§9.3 #15). These land before Phase 4.
   - **Deferred to Phase 5:** narrow-applicability invariants migrated to the typed-parser entrypoint (§9.3 #18) — can't write until the typed parser exists.
   - **Budget:** ~1-2 weeks of focused test work as called out in §9.4. Skipping it is not an option; the whole semantics-preservation non-goal hinges on this phase.
3. **Phase 1 — typed-argument parser in `@formspec/analysis`.** New module `tag-argument-parser.ts` with per-tag schemas. Test parity against every row in the §3 table. No wiring. Ship green.
3. **Phase 2 — route role-C off synthetic in the build path only.** `buildCompilerBackedConstraintDiagnostics` calls the new parser; keeps the synthetic call as a fallback for any tag not yet covered. Snapshot consumer unchanged. Ship green.
4. **Phase 3 — route role-C off synthetic in the snapshot path.** Mirror Phase 2 in `file-snapshots.ts:1300-1390`, preserving the diagnostic-code translation layer. This is where semantic-preservation testing is most critical: the ts-plugin/LSP consume these codes. Ship green.
5. **Phase 4 — relocate setup diagnostics.** This phase runs *before* any deletion. The setup-validation diagnostics (`UNSUPPORTED_CUSTOM_TYPE_OVERRIDE`, `SYNTHETIC_SETUP_FAILURE`) currently live in `compiler-signatures.ts:446-585` — validation of invalid TS identifiers, built-in name conflicts, duplicate custom type names. They surface in real user-facing tests (`compiler-signatures.test.ts:334-458`, `file-snapshots.test.ts:174-204`, `date-extension.integration.test.ts:287-339`). Relocate them to a registry-validation pass that runs once inside `createExtensionRegistry` (`packages/build/src/extensions/index.ts`, with a mirror pass invoked by the snapshot consumer's extension-loading site). Preserve diagnostic `code` and message shape exactly; *capture* current provenance in Phase 0's observability work (do not attempt to preserve it). Span **will** change (per-field → registry-level); this is unavoidable and must be explicitly signed off as a documented behavior change with release-notes entry, not a silent drift.
6. **Phase 5 — delete synthetic callers and narrow-applicability surface.** Once both consumers route role C through the typed parser, delete: `runSyntheticProgram`, `buildSyntheticBatchSource`, `checkSyntheticTagApplication`, `checkSyntheticTagApplications`, **`checkSyntheticTagApplicationsDetailed`** (the snapshot batch entrypoint at `compiler-signatures.ts:1196`, imported at `file-snapshots.ts:4,1374`), `lowerTagApplicationToSyntheticCall`, and the custom `CompilerHost`. Also handle `checkNarrowSyntheticTagApplicability` / `checkNarrowSyntheticTagApplicabilities` — they're module-internal (not re-exported from `@formspec/analysis/internal` per `packages/analysis/src/internal.ts:157-164`), so a monorepo-wide `rg` sweep is sufficient; no deprecation cycle needed. Their tests (`tag-capability-applicability.test.ts`, `compiler-signatures.test.ts:737-845`) must migrate to assert the same invariants against the new typed-parser surface before deletion.
7. **Phase 6 — delete prelude and supporting declarations.** Only now: remove `buildSyntheticHelperPrelude`, `buildSupportingDeclarations` (the thing #294/#297 has been patching), and the extension-type `unknown` aliases. Confirm `isIntegerBrandedType` bypass is preserved or explicitly replaced.
8. **Phase 7 — tidy `class-analyzer.ts` and `file-snapshots.ts`.** Remove unused `hostType`/`subjectType` plumbing if no longer needed. Document in ARCHITECTURE.md.

Each phase is independently shippable and test-green. Phase 0 validates assumptions before deletion. Phase 0.5 hardens the test surface before any implementation lands. Phases 2 and 3 can overlap but should land in separate PRs.

---

## 5. Test-preservation strategy

- Every existing test from §1.8 runs against the new path unchanged. These tests *are* the spec.
- Add `packages/analysis/src/__tests__/tag-argument-parser.test.ts` for the new parser, covering every row of the §3 table with positive + negative cases.
- **Parity harness for Phase 2.** Before Phase 2 lands, add a test harness that runs both the typed-argument path and the synthetic path over the same inputs and asserts diagnostic-equality (code + message). Wire it as a temporary Vitest project that can be disabled once Phase 4 lands. This is the safety net for the semantics-preservation non-goal.
- **Integer-branded regression canary.** Carve out the 7 imported/branded-Integer cases from `integer-type.test.ts` as a named sub-suite; re-run them with an environment toggle that forces the host-checker path, starting in Phase 2. Failures here are blockers.
- Keep `nounchecked-index-access.test.ts` intact — good canary for "same semantics under strict TS options."
- Snapshot/LSP surface: add at least one end-to-end test in `@formspec/language-server` or `@formspec/ts-plugin` asserting that post-refactor diagnostics match pre-refactor for a representative fixture (one D1, one D2, one `@pattern`, one path-target, one `isIntegerBrandedType`).

---

## 6. Risks and open questions

1. **Diagnostic message parity.** TS-compiler-authored messages currently bleed into `ConstraintSemanticDiagnostic.message`. `file-snapshots.ts:1367-1390` regex-matches those messages to assign codes. A new parser writes its own messages. Either: (a) reproduce message shapes faithfully, (b) update the code-translation layer to stop relying on TS message strings, or (c) both. Pick one in Phase 0 planning.
2. **`@pattern` regex validation becomes stricter.** Running `new RegExp(text)` in try/catch will start rejecting invalid regexes that pass synthetic today. This is an improvement, not a refactor — call it out as a separate, gated change.
3. **`@enumOptions` object-form handling.** The typed parser must preserve the `string | number | { id }` heterogeneous projection or Decimal/Enum ESLint rules will regress.
4. **`isIntegerBrandedType` bypass scope.** Decide whether to generalize it into the broadening registry or keep it as a dedicated bypass. Either is fine; silence is not.
5. **Performance.** The synthetic program already batches. Removing it should be strictly faster, but only after Phase 3 — Phase 2 runs both paths side-by-side and will be slower. Budget accordingly.
6. **Option-3 temptation.** If a future tag looks like it needs `ts.createSourceFile` + host checker, resist until at least one real use case forces the issue. The plan explicitly declines to treat this as a migration phase.
7. **Interaction with PR #297 (imported-type sibling fix)** and **PR #300 (`resolvePayload`)**. Both land in the "host checker only" direction; they're compatible with this refactor. But #297 patches the very `buildSupportingDeclarations` that Phase 6 deletes — coordinate timing so we're not patching code that's about to disappear.
8. **Unsupported deep-import risk (not Published API).** `@formspec/analysis`'s `package.json:9-24` exposes only `.` and `./internal`, and `./internal` (`packages/analysis/src/internal.ts:157-164`) does not re-export `checkNarrowSyntheticTagApplicability` / `...Applicabilities`. The helpers are therefore not part of the published API — any external caller would have to deep-import the source file. Before Phase 5 deletion, run `rg checkNarrowSyntheticTagApplicabilit` across the monorepo (sufficient for internal callers) and note in release notes that deep-imports of this symbol are unsupported; no formal deprecation cycle needed.
9. **`Infinity` / `NaN` in numeric tag arguments.** Build stringifies, snapshot passes through. Codex v2 flagged this as an unresolved semantic. Pick one before Phase 2.
10. **Relocated setup diagnostics may produce different spans.** Moving `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` from a per-field per-application site to a registry-level site changes *where* the diagnostic anchors. Consumers that rely on the provenance (IDE gutter markers, ESLint fixers) need verification.

---

## 7. What this document does not cover

- Function signatures of the new parser / validator (design-in-PR).
- Whether to expose the typed-argument parser as public `@formspec/analysis` API vs. `/internal`. Default: `/internal`; reconsider if ts-plugin needs it.
- Playground/LSP concrete changes — ts-plugin already consumes the host program, but the snapshot consumer in `file-snapshots.ts` is where LSP parity risk actually lives.

---

## 8. Success criteria

The refactor is not "done" when the synthetic program is deleted — it is done when these criteria all hold. Each one is independently verifiable.

### 8.1 Behavioral

1. **Test surface is green on the pre-refactor spec.** Every test from §1.8 passes against the new path, unchanged. The §9.4 checklist is fully executed (tracked as Phase 0.5).
2. **The cross-consumer parity harness (§9.1 #1) reports zero unexplained divergences.** Every build/snapshot delta is either (a) fixed by the refactor or (b) entered in the golden-divergence list with a citation to §3.
3. **No new user-visible diagnostic messages or codes** appear without an explicit release-notes entry. Span changes for setup diagnostics (Phase 4) are the single pre-approved exception.

### 8.2 Performance & resource

4. **Microbenchmark from §9.2 #8 shows post-Phase-4 wall time is ≤ Phase-0 baseline** on the representative 20-field fixture. "Should be faster" is not enough — the benchmark gates deletion.
5. **Peak analysis-phase memory drops measurably.** The synthetic `ts.Program` allocates a parallel type graph; removing it should cut peak RSS on a mid-sized fixture. Phase 0 captures baseline peak RSS; Phase 4 gate is "no regression, ideally ≥20% reduction on the 20-field fixture."
6. **Stripe `Ref<Customer>` stress test passes without OOM.** See §8.4 — this is the named acceptance test for the whole refactor.

### 8.3 Observability (debug logging) — explicit deliverable

Debug logging is not a nice-to-have. The refactor spans three phases of implementation across two consumers; without structured logs the parity harness cannot diagnose mismatches, the performance microbenchmark cannot attribute regressions, and the Stripe stress test cannot be triaged when it fails on user machines.

Deliverables, building on the pino logger from #298:

- **8.3a** A `formspec:analysis:constraint-validator` logger namespace, with sub-namespaces `:build`, `:snapshot`, `:typed-parser`, `:synthetic` (while it still exists), `:broadening`. Each logs at `debug` by default, `trace` for argument-lowering details.
- **8.3b** Per-tag-application structured log entry with: `consumer` (build/snapshot), `tag`, `placement`, `subjectTypeKind`, `roleOutcome` (A-pass / A-reject / B-pass / B-reject / C-pass / C-reject / D1 / D2 / bypass), `elapsedMicros`. Phase 0 lands this even before any implementation change — it *is* the observability counter from Phase 0.
- **8.3c** Extension-registry construction logs setup-diagnostic emission (count + codes) at `debug`. This is the runtime evidence behind §9 #19 (emission-count stability across registry rebuilds).
- **8.3d** `resolvePayload` invocations (from PR #300) log the extension id, custom type name, and whether `ts.Type`/`ts.TypeChecker` APIs were touched. Needed to triage the Stripe stress test — a bad `resolvePayload` implementation is a likely OOM cause.
- **8.3e** Parity-harness logs are structured JSON consumable by a diffing script, not free-form text. Phase 0.5a must define the schema.
- **8.3f** Documentation: ARCHITECTURE.md gains a short "Debugging constraint validation" section describing `DEBUG=formspec:analysis:constraint-validator:*` usage.

Acceptance check: enabling `trace`-level logging on the 20-field fixture produces a log that lets a human reconstruct every role-A-through-D1/D2 decision without consulting source.

### 8.4 Stripe `Ref<Customer>` stress test — named acceptance gate

Motivation: the `stripe` npm SDK exposes very complex, deeply-nested, heavily-generic types (discriminated unions with dozens of variants, recursive references, expandable-field polymorphism). The synthetic `ts.Program` has historically been the OOM risk in FormSpec — it instantiates a parallel type graph that the host checker has already computed once. If the refactor succeeds, running the *host* checker over a Stripe-typed form should Just Work, because the host program has already paid the type-instantiation cost.

**Fixture** (lives in `@formspec/e2e`):

- A form definition that uses a `Ref<T>` extension-provided custom type (enabled by PR #300's `resolvePayload`). Example shape: `Ref<Customer>`, `Ref<PaymentIntent>`, `Ref<Subscription>` — each should resolve to a reference-to-entity JSON Schema fragment via `resolvePayload` reading the `ts.Type`'s name.
- A real `import Stripe from "stripe"` in the fixture (peer dep, not bundled) so the host TS program pulls in the full SDK `.d.ts`.
- 5-10 fields per form covering: a `Ref<Customer>`, a `Ref<PaymentIntent>` with `@description`, a constrained string (`@minLength 1`), a constrained number (`@minimum 0`), a nested object with its own `Ref<>` field.

**Gates:**

- **8.4a** Pre-refactor baseline (Phase 0): run the fixture, record peak RSS, wall time, and whether it OOMs at all. Expected: measurable memory pressure; possibly OOM on CI runners with <2 GB.
- **8.4b** Post-Phase 4 gate: the same fixture completes with peak RSS ≤ 50% of the Phase-0 baseline and zero OOM on a 1 GB runner. If it fails, Phase 5/6 deletion is blocked until root-caused.
- **8.4c** Post-Phase 6 gate (synthetic fully deleted): same fixture again. No `ts.createProgram` call recorded in the debug logs (§8.3 counter for `:synthetic` namespace reads zero for the whole run).
- **8.4d** Bench it in CI as a guard against regressions, not just during the refactor.

This is the single most important acceptance test because it is the **external motivation** for retiring the synthetic program. If we cannot handle Stripe-shaped types at the end, the refactor has not delivered on its value proposition regardless of internal cleanup.

---

## 9. Brutal test-coverage assessment

The refactor will silently regress behavior unless the test surface is hardened *before* Phase 2. The current coverage is directionally decent but has structural gaps that will bite. Ordered by severity.

### 9.1 Critical gaps (block Phase 2 until addressed)

1. **No cross-consumer parity test exists anywhere.** Build and snapshot consume different lowering functions (`renderSyntheticArgumentExpression` vs `getArgumentExpression`) and produce different diagnostics today — but there is no test that compares them on the same input. This means Phase 2 (build migration) can land green with snapshot quietly regressing, and Phase 3 can land green with build quietly regressing. **Action:** write a parametric fixture suite (tag × type × argument shape) that runs both consumers and asserts either (a) diagnostic equality or (b) a known-divergence entry in a golden list. This is the single most important test investment before the refactor starts.

2. **LSP / ts-plugin constraint-diagnostic coverage is thin even though basic E2E exists.** `packages/ts-plugin/src/__tests__/semantic-service.test.ts:28-55`, `downstream-authoring-host.test.ts:29-71`, `packages/language-server/src/__tests__/plugin-client.test.ts:174-213` and `server.test.ts:284-340` already drive the consumers meaningfully. What's missing is *constraint-tag-specific* coverage through those surfaces. **Action:** extend the existing harnesses with three fixtures — `@minimum` on a string (expect TYPE_MISMATCH), `@minimum 0` on imported `Integer` (expect accept via bypass), path-target `@exclusiveMinimum :amount 0` on `Decimal` (expect accept via D2). Scope: three added fixtures, not a new harness.

3. **`isIntegerBrandedType` bypass coverage is narrow.** `integer-type.test.ts:439-497` covers 7 scenarios — imported, nullable, optional, mixed — through the *build* path. I see no corresponding tests for the *snapshot* path. If the bypass applies in one consumer and not the other, Phase 3 will regress IDE behavior without any test flagging it. **Action:** mirror the 7 cases into `file-snapshots.test.ts` before Phase 2.

4. **No test pins the `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` span/provenance.** Existing tests check `code` and `message.toMatch(...)` but not `primaryLocation`. Phase 4's relocation of setup diagnostics changes where they anchor. Without a span test, IDE gutter regressions go silent. **Action:** extend `compiler-signatures.test.ts:334-458` and `date-extension.integration.test.ts:287-339` to assert `primaryLocation.file`, `line`, and `column` against expected pre-relocation provenance, then update the expected values as part of Phase 4 with an explicit sign-off rather than silent drift.

5. **`@const` raw-string fallback has minimal negative coverage.** `tag-value-parser.test.ts:96-105` covers one case (`"not-json"` → string). No tests for: invalid numbers (`@const 1.2.3`), multi-line JSON (`@const [\n1,\n2\n]`), trailing-comma arrays, Unicode in strings, or the interaction of raw-string fallback with IR compatibility checks. A typed parser that chooses "JSON-strict" vs "permissive fallback" differently in edge cases will regress silently. **Action:** add ~6 edge-case tests to `tag-value-parser.test.ts` pinning current behavior as the spec.

### 9.2 Coverage weaknesses (address before Phase 4)

6. **`@pattern` coverage exists but is narrow.** Positive coverage lives at `unified-comment-parser.test.ts:191-201`, `parser-consistency.test.ts:260-269`, and `value-parsing.test.ts:46-65`. What is missing is TSDoc-special character round-tripping (braces, backticks, `@`) and invalid-regex behavior assertions. **Action:** add a tight matrix — one case per TSDoc-special character plus one invalid-regex case — asserting current round-trip behavior so a typed parser cannot silently tighten to `new RegExp(text)` rejection.

7. **`@enumOptions` heterogeneous-form tests are thin.** `tag-value-parser.test.ts` tests `@enumOptions` but I could not find explicit coverage of the `{ id }` object form interleaved with strings and numbers in a single array. If the typed parser drops object-form support, `numeric-extension.integration.test.ts` may not catch it because those tests use strings only. **Action:** add one test of `@enumOptions ["red", 7, {"id": "blue"}]` pinning the IR projection.

8. **Performance is untested.** No benchmarks exist for the synthetic path. **Action:** one microbenchmark in `@formspec/e2e` capturing synthetic-call count + wall time for a 20-field interface; Phase 0 baseline, post-Phase 4 must not regress. Keep it cheap — this is a canary, not a performance suite.

9. **Broadening + path-target combinations are under-tested for contradictions.** `generate-schemas-config.test.ts:192-460` covers the happy path (D2 plus broadening) and `@pattern`-on-numeric-Decimal contradiction (one case). What about: D1 + path-target on the same field (does the direct-field custom-constraint pathway shadow the path-target built-in?), `@minimum` + `@exclusiveMinimum` both on a path target, or `@const :nested.amount` with an extension type? **Action:** enumerate 4-6 combination cases and pin expected behavior explicitly, even if the answer is "reject as contradiction."

10. **`noUncheckedIndexedAccess` is the only TS-compiler-option canary.** `nounchecked-index-access.test.ts` covers one option. What about `strictNullChecks: false`, `useUnknownInCatchVariables: false`, `exactOptionalPropertyTypes: true`, `useDefineForClassFields: true`? Any of these could interact with the host-checker migration in ways the synthetic path absorbs today. **Action:** don't write tests for all of them — instead, add a per-option matrix to one representative fixture (`@minLength 1` on `string`) and assert identical diagnostics across a chosen set of 3-4 high-risk options.

11. **ESLint plugin is *not* an IR-diagnostic consumer — this is a false alarm.** `@formspec/eslint-plugin`'s `tag-type-check` rule (`packages/eslint-plugin/src/rules/type-compatibility/tag-type-check.ts:93-154`) computes mismatches directly from AST + host `ts.TypeChecker`, not from `ConstraintSemanticDiagnostic`. The refactor cannot silently regress the plugin through IR-message changes because the plugin never reads them. **No action required.** (Kept in the list because v3 mis-characterized this as a gap.)

### 9.3 Structural issues

12. **Semantics-preservation is pinned only by whatever tests happen to assert.** No canonical tag × type × argument-shape reference exists outside the tests themselves. **Action:** skip producing a full spec document; instead, add a single `constraint-tag-semantics.ref.md` listing the ~15 most-exercised tag/type/argument combinations with a test-ID cross-reference and the three known divergence entries from §3. Thin reference beats nothing and beats a maintenance burden.

13. **The test suite does not distinguish "we test this works" from "we test this fails with code X."** Many tests assert `.toMatch(/TYPE_MISMATCH/)` without pinning the message. Messages are consumed by IDEs and by `file-snapshots.ts:1367-1390`'s code-translation layer. **Action:** tighten a representative set of assertions to pin exact messages for the diagnostics that flow into the code-translation layer; loose matches are fine for the rest.

14. **There is no "silent acceptance" canary.** If a Phase 2 bug caused the typed parser to accept any argument as valid, most tests would still pass (they mostly test positive cases). **Action:** add ~5 negative-only cases per constraint tag — e.g., `@minimum "hello"`, `@enumOptions 5`, `@pattern 42` — asserting that the diagnostic fires with specific code + span. Without these, a "skip validation entirely" regression would ship green.

15. **No regression fixture covers PR #294 + #297 together under file-snapshots.** PR #297 added `CrossFileMixedConfig` / `CrossFileMixedTypeAlias` to `integer-type.test.ts`, but those run against the build path only. If the snapshot path also consumes `buildSupportingDeclarations` (it does, indirectly via the same prelude machinery), the refactor could regress IDE behavior for cross-file imported types. **Action:** add a file-snapshots variant of the CrossFileMixedConfig case before Phase 3.

16. **The three known build/snapshot divergences are unpinned.** §3 catalogs `@const not-json`, `@minimum Infinity`, and `@minimum NaN` as inputs where the two consumers already diverge today. No test asserts what each consumer actually produces. Phase 2/3 will parameterize the typed parser with a `lowering: "build" | "snapshot"` flag; without pinned tests, the flag is free to drift. **Action:** add three pair-tests (one per divergent input) asserting the build and snapshot diagnostic separately. These are the anchor for the eventual normalization PR.

17. **Orphaned raw-text fallback is untested.** `tsdoc-parser.ts:1152-1175` processes raw-text fallback from `ts.getJSDocTags()` *even when the unified parser produced no tag object* — a recovery path that matters for malformed comments. No test in the `tsdoc-parser` suite exercises this orphaned-fallback branch (I searched for fixtures combining a broken unified-parse with a recoverable raw tag). Phase 1's typed parser must either reproduce this recovery or explicitly decline to, but there's no spec test to pin it either way. **Action:** add one integration test where the unified parser fails on a field but a raw `@pattern "abc"` is still recovered — assert current behavior before Phase 1.

18. **Narrow-applicability invariants are not migration-planned.** `compiler-signatures.test.ts:737-845` covers `checkNarrowSyntheticTagApplicability` at the unit level (narrow prelude, placement-aware capability check). Phase 5 deletes that function; Phase 1's typed parser needs to carry the same placement-aware applicability logic forward. **Action:** before Phase 5, re-assert each `compiler-signatures.test.ts:737-845` invariant against the new typed-parser entrypoint so the tests migrate rather than die.

19. **Setup-diagnostic emission-count behavior across registry rebuilds is unpinned.** `compiler-signatures.test.ts:361-458` exercises repeated synthetic-batch checks and cache-hit behavior, but does not assert what happens when extension-registry construction repeats (as snapshot-driven consumers do across edits). Phase 4 relocates setup diagnostics to `createExtensionRegistry`; if the new site emits once per registry where the old site emitted once per batch, IDE noise multiplies. **Action:** add new tests asserting emission-count stability across repeated `createExtensionRegistry` + snapshot refresh, before Phase 4.

### 9.4 Summary of required test investment

This list is the source of truth; **Phase 0.5 in §4 is the execution plan** that schedules each item as a separately-mergeable PR. Before any Phase 2 code lands:

- [ ] Cross-consumer parity harness (9.1 #1)
- [ ] Three LSP/ts-plugin constraint fixtures added to existing harnesses (9.1 #2)
- [ ] Mirror `isIntegerBrandedType` cases in snapshot tests (9.1 #3)
- [ ] Span/provenance assertions for setup diagnostics (9.1 #4)
- [ ] `@const` raw-fallback edge cases (9.1 #5)
- [ ] Pinned tests for the three known build/snapshot divergences (9.3 #16)
- [ ] Orphaned raw-text fallback integration test (9.3 #17)
- [ ] Narrow-applicability invariants migrated to the typed-parser entrypoint before Phase 5 (9.3 #18)
- [ ] Setup-diagnostic emission-count stability test (9.3 #19)
- [ ] Thin `constraint-tag-semantics.ref.md` with ~15 entries (9.3 #12)
- [ ] Silent-acceptance negative-case canaries (9.3 #14)
- [ ] §8.3 debug-logging namespaces landed + ARCHITECTURE.md "Debugging constraint validation" section
- [ ] Stripe `Ref<Customer>` stress-test fixture + Phase-0 baseline (§8.4 / 0.5l)
- [ ] Parity-harness structured log schema + diffing helper (§8.3e / 0.5m)

Budget: ~1-2 weeks of focused test work. Skipping it turns this refactor into a game of whack-a-mole with user bug reports.

---

## 10. Recommended immediate next steps

1. Merge PR #297 (review comments addressed) — keeps the synthetic path healthy during Phases 0-4.
2. Merge PR #300 — unblocks the Stripe `Ref<Customer>` stress test (§8.4) and is precedent for extension callbacks on the host checker.
3. Open a tracking issue referencing this document, with §8 success criteria as the acceptance checklist.
4. Start Phase 0: land the §8.3 structured-logging namespaces + consumer audit + Phase-0 baselines for §8.2 metrics and §8.4 Stripe stress test. Small, observable, zero behavior change.
