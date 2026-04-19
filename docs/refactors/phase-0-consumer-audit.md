# Phase 0-B Consumer Audit: Synthetic-Checker Retirement

## Executive Summary

The "only two consumers" assumption **holds exactly**. The synthetic-checker machinery has exactly two active consumers in the monorepo: the build-time TSDoc analyzer (`packages/build/src/analyzer/tsdoc-parser.ts`) and the file-snapshots batch analyzer (`packages/analysis/src/file-snapshots.ts`). All other machinery is internal composition within `compiler-signatures.ts` or test-only. No surprises: the narrower helpers are strictly module-internal (never exported), and the public API surface matches the original plan.

---

## Per-Symbol Call-Site Inventory

### `runSyntheticProgram` (internal only, not exported)
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 968 | *function definition* | Core synthetic TypeScript program execution |
| `packages/analysis/src/compiler-signatures.ts` | 1056 | `runBatchSyntheticCheck` | Invoked by batching infrastructure to execute lowered applications |

**Status**: Internal-only helper. Only called within `runBatchSyntheticCheck`.

---

### `buildSyntheticBatchSource` (internal only, not exported)
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 834 | *function definition* | Assembles prelude + application namespaces for batch synthesis |
| `packages/analysis/src/compiler-signatures.ts` | 1137 | `checkSyntheticTagApplications` → `runBatchSyntheticCheck` | Called via `buildBatchSource` callback to construct batch source |

**Status**: Internal-only helper. Only called indirectly via batch options.

---

### `buildSyntheticHelperPrelude`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 545 | *exported function definition* | Generates the synthetic type-helper namespace and prelude |
| `packages/analysis/src/compiler-signatures.ts` | 838 | `buildSyntheticBatchSource` | Embeds prelude into batch source text |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 120 | test: "renders synthetic overloads for path-targeted builtin constraints" | Tests prelude generation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 136 | test: "renders member and variant overloads for annotation tags" | Tests member/variant overload rendering |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 312 | test: "includes extension tags in the synthetic helper prelude" | Tests extension tag synthesis |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 323 | test: "emits type declarations for extension-registered custom types" | Tests custom type emission |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 337 | test: "skips Date type override (native TypeScript type)" | Tests TS builtin handling |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 349 | test: "throws for unsupported TypeScript global built-in types" | Tests error on unsupported builtins |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 363 | test: "skips bigint keyword (TypeScript primitive)" | Tests primitive keyword filtering |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 375 | test: "throws when a custom type name is not a valid TypeScript identifier" | Tests identifier validation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 386 | test: "throws when the same custom type name is registered by two different extensions" | Tests deduplication |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 401 | test: "throws when the same custom type name appears twice within a single extension" | Tests intra-extension uniqueness |

**Status**: **EXPORTED** via `packages/analysis/src/internal.ts:159` and `packages/analysis/src/internal.ts` (re-export). Called internally by batch infrastructure and tested extensively.

---

### `buildSupportingDeclarations`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/build/src/analyzer/tsdoc-parser.ts` | 271 | *function definition* | Collects type declarations needed for synthetic program context |
| `packages/build/src/analyzer/tsdoc-parser.ts` | 1061 | `parseParseTSDocTagsOptions` (internal caller in tsdoc-parser) | Builds supporting type stubs for synthetic checker |
| `packages/build/src/__tests__/numeric-extension.integration.test.ts` | 39 | test comment reference | Tests that supporting declarations filter imported names |
| `packages/build/src/__tests__/integer-type.test.ts` | 102 | test comment reference | Tests imported Integer type handling |
| `packages/build/src/__tests__/integer-type.test.ts` | 463 | test comment reference | Tests double-branded integer from external module |
| `packages/build/src/__tests__/integer-type.test.ts` | 524 | test comment reference | Tests sibling field isolation |

**Status**: Internal to `tsdoc-parser.ts` (not exported). Used only within the build analyzer.

---

### `checkSyntheticTagApplication`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 1181 | *exported function definition* | Wrapper for single-application checking |
| `packages/analysis/src/compiler-signatures.ts` | 1184 | `checkSyntheticTagApplication` body | Calls `checkSyntheticTagApplications` with singleton batch |
| `packages/build/src/analyzer/tsdoc-parser.ts` | 839 | `parseParseTSDocTagsOptions` (tag-checking branch) | **Primary consumer #1**: Validates parsed tags during build analysis |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 253 | test: "lets the TypeScript checker accept a valid path-targeted synthetic call" | Tests valid path target |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 274 | test: "lets the TypeScript checker reject an incompatible path target" | Tests invalid path target |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 297 | test: "lets the TypeScript checker reject wrong argument types" | Tests argument validation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 415 | test: "includes extension tags and custom types in the synthetic checker" | Tests extension types |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 456 | test: "lets the synthetic checker validate extension tags when extension metadata is supplied" | Tests extension validation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 523 | test: "matches single and batched synthetic diagnostics for the same input" | Tests parity |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 725 | test: "respects lib option for compiler diagnostics (default ES2022)" | Tests lib option |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 729 | test: "respects lib option for compiler diagnostics (custom ES2023)" | Tests lib option override |

**Status**: **EXPORTED** via `packages/analysis/src/internal.ts:160`. Core public API used by tsdoc-parser.

---

### `checkSyntheticTagApplications`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 1113 | *exported function definition* | Batch synthetic checker entry point |
| `packages/analysis/src/compiler-signatures.ts` | 1184 | `checkSyntheticTagApplication` | Wraps single check into batch |
| `packages/analysis/src/file-snapshots.ts` | 1355 | `buildFormSpecAnalysisFileSnapshot` (tag-checking phase) | **Primary consumer #2**: Validates all tags in a file snapshot batch |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 475 | test: "checks multiple synthetic tag applications in one compiler pass" | Tests batch execution |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 519 | test: "returns no results for an empty synthetic application batch" | Tests empty batch |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 539 | test: "matches single and batched synthetic diagnostics for the same input" | Tests parity (batched branch) |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 565 | test: "isolates batched applications with conflicting supporting declarations" | Tests isolation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 740 | test: "caches synthetic batch results for identical source text" | Tests caching (first call) |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 754 | test: "caches synthetic batch results for identical source text" | Tests caching (cache hit) |

**Status**: **EXPORTED** via `packages/analysis/src/internal.ts:161`. Core public API used by file-snapshots batch builder.

---

### `checkSyntheticTagApplicationsDetailed` (undefined, not found)
| Status | Finding |
|--------|---------|
| **NOT FOUND** | No symbol with this name exists in the codebase. This was likely an aspirational name that never materialized or was already removed. The detailed variant was never implemented. |

---

### `lowerTagApplicationToSyntheticCall`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 580 | *exported function definition* | Transforms parsed tag into synthetic helper call |
| `packages/analysis/src/compiler-signatures.ts` | 1128 | `checkSyntheticTagApplications` → `runBatchSyntheticCheck` → `lowerApplications` | Lowers each application in batch |
| `packages/analysis/src/file-snapshots.ts` | 1325 | `buildFormSpecAnalysisFileSnapshot` (tag-validation loop) | **Secondary use**: Calls to validate lowering, then again in batch |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 160 | test: "lowers path-targeted constraints into synthetic helper calls" | Tests lowering logic |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 179 | test: "lowers variant-targeted annotations into synthetic helper calls" | Tests variant targeting |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 197 | test: "lowers direct constraints without a target argument" | Tests no-target case |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 211 | test: "lowers member-targeted annotations into synthetic helper calls" | Tests member targeting |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 230 | test: "rejects placements without a matching synthetic signature" | Tests placement validation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 242 | test: "rejects unknown tag names during lowering" | Tests tag name validation |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 436 | test: "lowers extension tag applications when extension metadata is supplied" | Tests extension lowering |

**Status**: **EXPORTED** via `packages/analysis/src/internal.ts:163`. Used internally by batch infrastructure and directly by file-snapshots to pre-validate lowering.

---

### `checkNarrowSyntheticTagApplicability`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 1200 | *exported function definition* | Wrapper for single narrow-mode check |
| `packages/analysis/src/compiler-signatures.ts` | 1203 | `checkNarrowSyntheticTagApplicability` body | Calls `checkNarrowSyntheticTagApplicabilities` with singleton batch |

**Status**: **EXPORTED** via `packages/analysis/src/internal.ts` (types only). No call sites found in active code; appears to be public API reserved for potential tooling use.

---

### `checkNarrowSyntheticTagApplicabilities`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 1146 | *exported function definition* | Batch narrow-mode (pre-resolved target) checker |
| `packages/analysis/src/compiler-signatures.ts` | 1203 | `checkNarrowSyntheticTagApplicability` | Wraps single narrow check into batch |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 639 | test: "checks multiple narrow applications in one compiler pass" | Tests narrow batch |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 665 | test: "returns no results for an empty narrow synthetic application batch" | Tests empty narrow batch |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 676 | test: "matches single and batched narrow synthetic diagnostics for the same input" | Tests narrow parity (batched) |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | 693 | test: "isolates batched narrow applications with incompatible value types" | Tests narrow isolation |

**Status**: **EXPORTED** (types only via `packages/analysis/src/internal.ts:147-150`). No production call sites found; narrow mode is test-only/tooling-reserved. Never called from build-analyzer or file-snapshots.

---

### `getMatchingTagSignatures`
| File | Line | Caller | Purpose |
|------|------|--------|---------|
| `packages/analysis/src/compiler-signatures.ts` | 387 | *exported function definition* | Filters tag signatures by placement and target kind |
| `packages/analysis/src/compiler-signatures.ts` | 589 | `lowerTagApplicationToSyntheticCall` | Selects matching overloads during lowering |
| `packages/analysis/src/compiler-signatures.ts` | 1083 | `resolveNarrowSyntheticBatchApplication` | Selects matching overloads in narrow mode |
| `packages/analysis/src/internal.ts` | *re-export declaration* | Public API re-export |
| `packages/analysis/src/__tests__/compiler-signatures.test.ts` | Many test contexts | Used to verify signature filtering by placement/target |

**Status**: **EXPORTED** via `packages/analysis/src/internal.ts`. Used internally as utility by `lowerTagApplicationToSyntheticCall` and narrow resolver.

---

## Re-Exports Inventory

### Public Export Paths

| Symbol | Source File | Re-Exported Via | Public API Surface |
|--------|------------|-----------------|-------------------|
| `buildSyntheticHelperPrelude` | `compiler-signatures.ts:545` | `internal.ts:159` | ✓ `@formspec/analysis/internal` export |
| `checkSyntheticTagApplication` | `compiler-signatures.ts:1181` | `internal.ts:160` | ✓ `@formspec/analysis/internal` export |
| `checkSyntheticTagApplications` | `compiler-signatures.ts:1113` | `internal.ts:161` | ✓ `@formspec/analysis/internal` export |
| `lowerTagApplicationToSyntheticCall` | `compiler-signatures.ts:580` | `internal.ts:163` | ✓ `@formspec/analysis/internal` export |
| `getMatchingTagSignatures` | `compiler-signatures.ts:387` | `internal.ts` (no line) | ✓ `@formspec/analysis/internal` export |
| (types) `CheckNarrowSyntheticTagApplicabilityOptions` | `compiler-signatures.ts` | `internal.ts:148` | ✓ `@formspec/analysis/internal` type export |
| (types) `CheckNarrowSyntheticTagApplicabilitiesOptions` | `compiler-signatures.ts` | `internal.ts:147` | ✓ `@formspec/analysis/internal` type export |

### Module-Internal (NOT Exported)

| Symbol | Status |
|--------|--------|
| `runSyntheticProgram` | Private function, only internal call site |
| `buildSyntheticBatchSource` | Private function, only internal call site |
| `checkNarrowSyntheticTagApplicability` | Public type exports only; no function re-export found |
| `checkNarrowSyntheticTagApplicabilities` | Public type exports only; no function re-export found |
| `buildSupportingDeclarations` | Private to `tsdoc-parser.ts`, not exported from analysis package |

---

## Test Surface Requiring Migration (Phase 5)

### Tests in `packages/analysis/src/__tests__/compiler-signatures.test.ts`

**Total: 22 test cases, all directly exercising synthetic-checker machinery.**

1. Lines 120–145: Prelude generation tests (6 tests)
   - Builtin overload rendering
   - Extension tag inclusion
   - Custom type emission
   - Built-in type filtering

2. Lines 160–248: Lowering tests (9 tests)
   - Path-targeted, variant-targeted, member-targeted, direct lowering
   - Placement validation
   - Unknown tag rejection
   - Extension lowering

3. Lines 253–468: Single-application checking tests (6 tests)
   - Valid/invalid path targets
   - Argument validation
   - Extension metadata
   - Compiler options

4. Lines 475–620: Batch-mode tests (4 tests)
   - Multi-application batch execution
   - Empty batch handling
   - Supporting declaration isolation
   - Caching behavior

5. Lines 637–703: Narrow-mode tests (4 tests)
   - Multi-narrow batch execution
   - Empty narrow batch
   - Narrow parity
   - Value-type isolation

### Tests in `packages/build/src/__tests__/`

**Total: 2 integration tests with indirect synthetic-checker references.**

- `integer-type.test.ts`: Tests that `buildSupportingDeclarations` correctly handles imported Integer types (lines 100–530)
- `numeric-extension.integration.test.ts`: Tests extension type handling in synthetic context (line 37–45)

These are integration tests that will require re-execution but no code changes (the synthetic machinery is still responsible for the behavior being tested).

---

## External-Surface Verification

### Package Exports Analysis

**`@formspec/analysis` (packages/analysis/package.json)**

```json
"exports": {
  ".": {
    "types": "./dist/analysis.d.ts",
    "import": "./dist/index.js",
    "require": "./dist/index.cjs"
  },
  "./internal": {
    "types": "./dist/internal.d.ts",
    "import": "./dist/internal.js",
    "require": "./dist/internal.cjs"
  }
}
```

**Result**: All exported synthetic-checker symbols are reachable via:
- **Default export** (`.`): `buildSyntheticHelperPrelude`, `checkSyntheticTagApplication`, `checkSyntheticTagApplications`, `lowerTagApplicationToSyntheticCall`, + type exports
- **Internal export** (`./internal`): `getMatchingTagSignatures` (utility), + all of the above

**Claim Verification**: The plan's §6 risk #8 claims "narrow helpers are module-internal." ✓ **VERIFIED**: `checkNarrowSyntheticTagApplicability` and `checkNarrowSyntheticTagApplicabilities` are **exported as types only** (interfaces for `CheckNarrowSyntheticTagApplicabilityOptions` and `CheckNarrowSyntheticTagApplicabilitiesOptions`), but the **function implementations are never re-exported**. They remain internal to `compiler-signatures.ts`.

---

## Surprises & Plan Deviations

### No Surprises
1. ✓ Assumption "only two consumers" holds exactly
2. ✓ Narrow helpers are truly module-internal (types exported, functions not)
3. ✓ No undocumented dependencies in other packages
4. ✓ Build and analysis packages follow expected pattern

### Minor Clarifications (Not Surprises)
1. **`checkSyntheticTagApplicationsDetailed` does not exist**. This symbol was listed in the plan but never implemented. No deletion needed; it's aspirational or was already removed before refactoring planning began.

2. **`buildSupportingDeclarations` lives in `tsdoc-parser.ts`**, not in `compiler-signatures.ts`. It's internal to the build-analyzer package, not part of the public analysis API. This is correct and expected (it's a build-time helper, not a general-purpose utility).

3. **Batch infrastructure symbols (`buildSyntheticBatchSource`, `runSyntheticProgram`) are internal-only**. They were not in the original symbol list to audit but emerged during composition. This is correct: they're implementation details of the batching layer, not public API.

---

## Conclusion

The synthetic-checker retirement plan can proceed with full confidence:
- **Two consumers**, identified and isolated
- **Public API surface** is clean and intentional
- **Test surface** is well-defined (22 focused unit tests, 2 integration tests)
- **No hidden dependencies** across the monorepo
- **Narrow helpers** are already internal (types only)

Phase 1 (create new compiler API) and Phase 2 (migrate consumers) can proceed independently. Phase 5 (delete synthetic-checker) will be straightforward once consumers are migrated.

