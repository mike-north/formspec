# @formspec/eslint-plugin

## 0.1.0-alpha.66

### Patch Changes

- [#472](https://github.com/mike-north/formspec/pull/472) [`59969ae`](https://github.com/mike-north/formspec/commit/59969aedb704371f3b2fef52c5355b1786668707) Thanks [@aidencurtis](https://github.com/aidencurtis)! - Align `@formspec/eslint-plugin` tag applicability checks with `@formspec/analysis` semantic capabilities, so built-in tags classify branded primitive intersections consistently. Numeric constraint tags such as `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, and `@multipleOf` now accept branded numeric aliases like `Integer`, `PositiveInteger`, and branded `bigint` types without false-positive type-mismatch errors, while incorrect cross-kind usages still report mismatches.

- [#468](https://github.com/mike-north/formspec/pull/468) [`ec2c6df`](https://github.com/mike-north/formspec/commit/ec2c6df45d70b71448ff44feafd93c9ffb8df4aa) Thanks [@mike-north](https://github.com/mike-north)! - Document the single-program analysis architecture, update stale post-synthetic-checker comments, and align snapshot broadening-bypass logging.

- [#480](https://github.com/mike-north/formspec/pull/480) [`ae616dc`](https://github.com/mike-north/formspec/commit/ae616dcd521686d80d427241036c057400df9003) Thanks [@mike-north](https://github.com/mike-north)! - Align configuration loading with issue #429 by removing legacy YAML/browser-only surfaces and introducing a filesystem adapter for config discovery.

  ### `@formspec/config`
  - Added `FileSystem` and `LoadConfigOptions.fileSystem` so non-Node consumers can supply path, existence, and file-read operations while `loadFormSpecConfig` lazily loads Node defaults.
  - Removed `@formspec/config/browser` and removed `loadConfigFromString`.
  - Removed `./formspec.schema.json` package export and deleted the shipped schema file.
  - Removed the `yaml` dependency.

  ### Downstream packages
  - Re-release packages that depend on `@formspec/config` so their published dependency graph reflects the unified config surface.

- [#477](https://github.com/mike-north/formspec/pull/477) [`c0ade4f`](https://github.com/mike-north/formspec/commit/c0ade4fd8472b35b436b6c43b605b4a9cfce77f1) Thanks [@mike-north](https://github.com/mike-north)! - Extract shared Chain DSL policy types, defaults, and validators into the private internal `@formspec/dsl-policy` package while preserving compatibility re-exports from `@formspec/config`.

- Updated dependencies [[`ec2c6df`](https://github.com/mike-north/formspec/commit/ec2c6df45d70b71448ff44feafd93c9ffb8df4aa), [`ae616dc`](https://github.com/mike-north/formspec/commit/ae616dcd521686d80d427241036c057400df9003), [`c0ade4f`](https://github.com/mike-north/formspec/commit/c0ade4fd8472b35b436b6c43b605b4a9cfce77f1)]:
  - @formspec/analysis@0.1.0-alpha.66
  - @formspec/build@0.1.0-alpha.66
  - @formspec/config@0.1.0-alpha.66

## 0.1.0-alpha.65

### Minor Changes

- [#453](https://github.com/mike-north/formspec/pull/453) [`4fd83da`](https://github.com/mike-north/formspec/commit/4fd83da2603e1e9686f967feede9230006d22601) Thanks [@mike-north](https://github.com/mike-north)! - Reconcile the public ESLint rule inventory with the tooling spec.
  - Add canonical rule IDs `formspec/documentation/no-unsupported-description-tag`, `formspec/dsl-policy/allowed-field-types`, and `formspec/dsl-policy/allowed-layouts`.
  - Keep `formspec/constraint-validation/no-description-tag`, `formspec/constraints-allowed-field-types`, and `formspec/constraints-allowed-layouts` as deprecated aliases for existing ESLint configs.
  - Enable `formspec/tag-recognition/no-markdown-formatting` as a warning in `recommended` and an error in `strict`, and enable the DSL-policy rules in both presets.

- [#463](https://github.com/mike-north/formspec/pull/463) [`ecdce95`](https://github.com/mike-north/formspec/commit/ecdce95f2c63dfa89fa339163a811aca89988296) Thanks [@mike-north](https://github.com/mike-north)! - Add lint diagnostics for invalid singular/plural naming variant targets, defaults on required fields, and misplaced discriminator tags.

- [#459](https://github.com/mike-north/formspec/pull/459) [`491404a`](https://github.com/mike-north/formspec/commit/491404af4a564205e16f0d5f739aaaa7c75a3ef9) Thanks [@mike-north](https://github.com/mike-north)! - Add `formspec/documentation/remarks-without-summary`, a documentation-hygiene rule for the `REMARKS_WITHOUT_SUMMARY` info diagnostic when `@remarks` appears without summary text before the first tag. The rule is included in both recommended and strict presets as an ESLint warning because ESLint flat config does not have an info severity.

- [#431](https://github.com/mike-north/formspec/pull/431) [`96d2c16`](https://github.com/mike-north/formspec/commit/96d2c16d6e17c186c48860230ec51846e6a65d53) Thanks [@mike-north](https://github.com/mike-north)! - Widen the `typescript` peer-dep range from `^5.9.3` to `>=5.7.3 <7`. FormSpec now officially supports TypeScript 5.7 through 6.x. The `<7` upper bound is deliberate — TypeScript 7.x is the Go rewrite with a substantively different API surface, and that migration will be handled separately. The 5.7 floor reflects the lowest version where the workspace's full toolchain (build, typecheck, test, lint) passes end-to-end; build/test alone work down to 5.5, but `@typescript-eslint/parser` 8.x's project-service mode misbehaves below 5.7.

  `@formspec/language-server` and `formspec` (the umbrella) inherit this support transitively through their dependencies on `@formspec/analysis` and `@formspec/build` respectively.

### Patch Changes

- [#465](https://github.com/mike-north/formspec/pull/465) [`f603680`](https://github.com/mike-north/formspec/commit/f60368008efd87b1b8e2b564faacafdbeaa942e3) Thanks [@mike-north](https://github.com/mike-north)! - Reconcile `@formspec/config` documentation with its unified-configuration identity (resolves [#419](https://github.com/mike-north/formspec/issues/419) — documentation half).

  The package JSDoc on `packages/config/src/index.ts` now describes `@formspec/config` as the unified configuration package (schemas, extensions, serialization, metadata policy, pipeline settings) and acknowledges that DSL-policy validation lives here transitionally pending the factoring tracked in [#420](https://github.com/mike-north/formspec/issues/420). The `package.json` description is updated to mention DSL-policy validation explicitly. No source-code or runtime behavior changes.

  The transitive-dependent patch bumps (`@formspec/build`, `@formspec/cli`, `@formspec/eslint-plugin`, `@formspec/language-server`, `formspec`) are required by the monorepo's mechanical changeset gate; they carry no functional changes.

- [#431](https://github.com/mike-north/formspec/pull/431) [`96d2c16`](https://github.com/mike-north/formspec/commit/96d2c16d6e17c186c48860230ec51846e6a65d53) Thanks [@mike-north](https://github.com/mike-north)! - Fix `@formspec/eslint-plugin` rules under TypeScript 6.x by replacing hardcoded `ts.TypeFlags` numeric literals in the type-classification helpers with `ts.TypeFlags.X` enum references. TS 6 renumbered the entire `TypeFlags` enum, which caused `isStringType`, `isNumberType`, `isBooleanType`, `isNullableType`, and `getFieldTypeCategory` to produce wrong results (e.g. reporting `nonStringLikeTargetField` instead of `nullableTargetField` for `string | null`). Behavior under TS 5.x is unchanged.

- [#460](https://github.com/mike-north/formspec/pull/460) [`5107fee`](https://github.com/mike-north/formspec/commit/5107fee15f6a3b590445cd1689840633ec3dded8) Thanks [@mike-north](https://github.com/mike-north)! - Finish `@description` removal by dropping it from shared tag metadata and adding an autofix that moves unsupported `@description` content into TSDoc summary text.

- [#456](https://github.com/mike-north/formspec/pull/456) [`5c5ab75`](https://github.com/mike-north/formspec/commit/5c5ab75e90c5063512739f7bb8ffe77de5d54d7e) Thanks [@mike-north](https://github.com/mike-north)! - Fix `@formspec/eslint-plugin/base` shipping with no `.d.ts` rollup, which made consumer projects fall back to implicit `any` for `createConstraintRule` and the JSDoc/type utility helpers.

  The package's `exports["./base"].types` pointed at `./dist/base.d.ts`, but the build never produced that file — only the bundled `.cjs`/`.js` outputs and per-source declarations under `dist/src/`. Added a second API Extractor configuration (`api-extractor.base.json`) targeting `src/base.ts`, wired into the `build` and `api-extractor[:local]` scripts so both the index and base entry points get rolled up. Added `@public` release tags to the symbols re-exported from `base.ts` so API Extractor accepts the new entry point.

- [#450](https://github.com/mike-north/formspec/pull/450) [`ee358d0`](https://github.com/mike-north/formspec/commit/ee358d0ab2b71b95df99ff84c40f437ace3a54ca) Thanks [@mike-north](https://github.com/mike-north)! - Support bracketed multi-line JSON tag arguments in comment parsing, including `@const` arrays and objects.

- [#462](https://github.com/mike-north/formspec/pull/462) [`865f4e7`](https://github.com/mike-north/formspec/commit/865f4e749f9557d084298f258df4be9a3c56b481) Thanks [@mike-north](https://github.com/mike-north)! - Emit `ANONYMOUS_RECURSIVE_TYPE` for unsupported anonymous recursive type shapes, fail schema generation with diagnostics for those shapes, and surface the lint rule through the ESLint recommended and strict rule sets. Named recursive `$defs` / `$ref` behavior is unchanged.

- [#445](https://github.com/mike-north/formspec/pull/445) [`9fe2efc`](https://github.com/mike-north/formspec/commit/9fe2efc984b2ae000d3776aa3e1e2d5f2413e287) Thanks [@mike-north](https://github.com/mike-north)! - Sort generated JSON Schema `required` arrays alphabetically for deterministic output.

- [#446](https://github.com/mike-north/formspec/pull/446) [`69f296c`](https://github.com/mike-north/formspec/commit/69f296ce9834069301ed7bf9b8c9cca0919c240a) Thanks [@mike-north](https://github.com/mike-north)! - Add a regression test pinning multi-file `@format` inheritance provenance.

- [#444](https://github.com/mike-north/formspec/pull/444) [`4c26e5b`](https://github.com/mike-north/formspec/commit/4c26e5bf7c4c42cca8042b150af4c8cd671a63ba) Thanks [@mike-north](https://github.com/mike-north)! - Add focused regression coverage for TypeScript-backed field type classification helpers.

- [#458](https://github.com/mike-north/formspec/pull/458) [`170f772`](https://github.com/mike-north/formspec/commit/170f772a8173f0f83c7a7c837eca874bae034736) Thanks [@mike-north](https://github.com/mike-north)! - Add a repository lint guard that rejects hardcoded numeric TypeScript compiler flag bitmasks in package source files.

- Updated dependencies [[`f603680`](https://github.com/mike-north/formspec/commit/f60368008efd87b1b8e2b564faacafdbeaa942e3), [`5107fee`](https://github.com/mike-north/formspec/commit/5107fee15f6a3b590445cd1689840633ec3dded8), [`ee358d0`](https://github.com/mike-north/formspec/commit/ee358d0ab2b71b95df99ff84c40f437ace3a54ca), [`865f4e7`](https://github.com/mike-north/formspec/commit/865f4e749f9557d084298f258df4be9a3c56b481), [`9fe2efc`](https://github.com/mike-north/formspec/commit/9fe2efc984b2ae000d3776aa3e1e2d5f2413e287), [`69f296c`](https://github.com/mike-north/formspec/commit/69f296ce9834069301ed7bf9b8c9cca0919c240a), [`96d2c16`](https://github.com/mike-north/formspec/commit/96d2c16d6e17c186c48860230ec51846e6a65d53)]:
  - @formspec/config@0.1.0-alpha.65
  - @formspec/build@0.1.0-alpha.65
  - @formspec/analysis@0.1.0-alpha.65

## 0.1.0-alpha.64

### Patch Changes

- [#413](https://github.com/mike-north/formspec/pull/413) [`68228ba`](https://github.com/mike-north/formspec/commit/68228ba7db7c73f908ad9743950dc8821dcdad12) Thanks [@mike-north](https://github.com/mike-north)! - Add regression tests for `@format` inheritance across hybrid heritage + type-alias chains (issue #383). The unified BFS in `collectInheritedTypeAnnotations` already crosses alias boundaries in both directions; these tests pin that behavior so a future refactor cannot break either composition direction.

- [#414](https://github.com/mike-north/formspec/pull/414) [`fc75ca4`](https://github.com/mike-north/formspec/commit/fc75ca4ec95b03aeb4c589c625ce1e03bd471cd2) Thanks [@mike-north](https://github.com/mike-north)! - Fail fast when TSDoc schema generation encounters same-named type definitions from different source modules, preventing silent `$defs` collisions.

- [#415](https://github.com/mike-north/formspec/pull/415) [`2f50fc3`](https://github.com/mike-north/formspec/commit/2f50fc3debd46fb64101f4ce4a08b584f0d719c8) Thanks [@mike-north](https://github.com/mike-north)! - Move extension tag-name flattening and settings-bound extension registry reading into `@formspec/analysis`.

  The ESLint plugin now uses the shared analysis helpers for extension-registered constraint tags, metadata slots, annotations, and built-in constraint broadening instead of maintaining local `settings.formspec.extensionRegistry` casts.

- [#421](https://github.com/mike-north/formspec/pull/421) [`e06cebc`](https://github.com/mike-north/formspec/commit/e06cebc2f111cca0b8f5076b824f2cfcb59e0321) Thanks [@mike-north](https://github.com/mike-north)! - Relocate the `@format` heritage walker (`collectInheritedTypeAnnotations`, `extractNamedTypeAnnotations`, `INHERITABLE_TYPE_ANNOTATION_KINDS`) from `@formspec/build` to `@formspec/analysis` (resolves #379). The walk is now reusable by IDE surfaces (hover, diagnostics) without depending on `@formspec/build`. The walk itself is parser-agnostic — callers supply a `HeritageAnnotationExtractor` callback so the analysis package does not bind to build's TSDoc parser or `ExtensionRegistry`. Build keeps a thin adapter that supplies the existing extractor; no behavior change.

- [#412](https://github.com/mike-north/formspec/pull/412) [`f91cc78`](https://github.com/mike-north/formspec/commit/f91cc78817cfb3fc5a1a492f3812c2e6dc186c46) Thanks [@mike-north](https://github.com/mike-north)! - Drop the no-op `baseUrl: "."` from each package's build tsconfig and pin `types: ["node"]` at the workspace root. `paths` resolves relative to the tsconfig file when `baseUrl` is omitted (TS 4.1+), so emitted declarations are unchanged. Required for clean builds under TypeScript 6.x, which deprecates `baseUrl` and no longer auto-includes `@types/node` globals.

- Updated dependencies [[`68228ba`](https://github.com/mike-north/formspec/commit/68228ba7db7c73f908ad9743950dc8821dcdad12), [`fc75ca4`](https://github.com/mike-north/formspec/commit/fc75ca4ec95b03aeb4c589c625ce1e03bd471cd2), [`2f50fc3`](https://github.com/mike-north/formspec/commit/2f50fc3debd46fb64101f4ce4a08b584f0d719c8), [`e06cebc`](https://github.com/mike-north/formspec/commit/e06cebc2f111cca0b8f5076b824f2cfcb59e0321), [`f91cc78`](https://github.com/mike-north/formspec/commit/f91cc78817cfb3fc5a1a492f3812c2e6dc186c46)]:
  - @formspec/build@0.1.0-alpha.64
  - @formspec/analysis@0.1.0-alpha.64
  - @formspec/config@0.1.0-alpha.64

## 0.1.0-alpha.63

### Patch Changes

- [#410](https://github.com/mike-north/formspec/pull/410) [`2f430b6`](https://github.com/mike-north/formspec/commit/2f430b60f55c600b3e18a91a54f637feb56b9a55) Thanks [@mike-north](https://github.com/mike-north)! - Internal restructure: tests moved from `src/__tests__/` to a sibling `tests/` folder in each package, with the TypeScript typecheck scope widened to cover them. No public API changes.

- Updated dependencies [[`2f430b6`](https://github.com/mike-north/formspec/commit/2f430b60f55c600b3e18a91a54f637feb56b9a55)]:
  - @formspec/analysis@0.1.0-alpha.63
  - @formspec/build@0.1.0-alpha.63
  - @formspec/config@0.1.0-alpha.63
  - @formspec/core@0.1.0-alpha.63

## 0.1.0-alpha.61

### Patch Changes

- [#406](https://github.com/mike-north/formspec/pull/406) [`c51c4c8`](https://github.com/mike-north/formspec/commit/c51c4c8fd5f0280b83a3e1d0a6895e88018e6c05) Thanks [@mike-north](https://github.com/mike-north)! - Internal refactor: unexport `MethodParamsSchemas` from `@formspec/build/src/generators/method-schema.ts`. The type was never referenced outside its defining module, was not part of the package's public `exports`, and did not appear in any API Extractor report — it is now a module-local interface. No consumer-visible change.

- Updated dependencies [[`c51c4c8`](https://github.com/mike-north/formspec/commit/c51c4c8fd5f0280b83a3e1d0a6895e88018e6c05)]:
  - @formspec/build@0.1.0-alpha.61

## 0.1.0-alpha.60

### Minor Changes

- [#401](https://github.com/mike-north/formspec/pull/401) [`8f41a9f`](https://github.com/mike-north/formspec/commit/8f41a9f992de04b25477d70ea139ff3ef47db98a) Thanks [@mike-north](https://github.com/mike-north)! - Phase 5 Slice C — retire the synthetic TypeScript program batch.

  Deletes the parallel-program constraint-tag checker that drove role-D validation in both
  consumers. Constraint-tag validation now flows through three unified stages in both the
  build and snapshot consumers:
  - Role A — placement pre-check (`getMatchingTagSignatures`)
  - Role B — capability guard, now extended to cover path-targeted tags in the snapshot
    consumer (`_supportsConstraintCapability` + `resolvePathTargetType`)
  - Role C — typed-parser argument validation (`parseTagArgument`)

  The `@formspec/analysis/internal` export surface loses the synthetic-checker entry points
  (`checkSyntheticTagApplication`, `checkSyntheticTagApplications`,
  `checkSyntheticTagApplicationsDetailed`, `lowerTagApplicationToSyntheticCall`,
  `buildSyntheticHelperPrelude`, `checkNarrowSyntheticTagApplicability` /
  `…Applicabilities`, `FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES`,
  `_mapGlobalSyntheticTsDiagnostics`) along with their option and result types. These were
  documented as `@internal` and never part of the public API surface. The retained
  setup-diagnostic helpers (`_validateExtensionSetup`, `_emitSetupDiagnostics`,
  `_mapSetupDiagnosticCode`, `SetupDiagnostic` — renamed from `SyntheticCompilerDiagnostic`)
  continue to anchor extension registry setup failures.

  `FormSpecSemanticServiceStats` in `@formspec/ts-plugin` drops the four synthetic counters
  (`syntheticBatchCacheHits`, `syntheticBatchCacheMisses`, `syntheticCompileCount`,
  `syntheticCompileApplications`). Query totals and file-snapshot cache hit/miss ratios
  remain and cover the same warm/cold semantics.

  The §8.4b memory gate target is peak RSS ≤ 700 MB on `stripe-realistic-build`; the Phase
  5C measurement is 769.5 MB — a 91.8 MB (10.7%) improvement over the Phase 0 baseline of
  861.3 MB but 69.5 MB above the gate. The synthetic `ts.createProgram` surface is fully
  retired (no more `analysis.syntheticCheckBatch.*` performance events); remaining headroom
  will be pursued as a follow-up.

  Per the repo's lockstep release convention, changes under `packages/<name>/src` bump the
  affected package and all transitively-dependent packages. `@formspec/analysis` takes a
  minor bump because removed symbols from `./internal` may break deep-imports;
  `@formspec/ts-plugin` takes a minor bump because `FormSpecSemanticServiceStats` (a
  `@public` interface) removes four `readonly` counters. All other `@formspec/*` packages
  take a minor bump together under the lockstep version-link convention.

### Patch Changes

- [#404](https://github.com/mike-north/formspec/pull/404) [`f0929c6`](https://github.com/mike-north/formspec/commit/f0929c60e7f74db7da6cffd589a8daaa5ba1e834) Thanks [@mike-north](https://github.com/mike-north)! - Tighten external-dependency minimums so every package advertises the version it's actually built against, and align internal devDependencies across the workspace.

  Consumer-visible:
  - `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised from `^5.0.0` to `^5.7.3`.
  - `@formspec/cli`: `typescript` runtime dependency raised from `^5.0.0` to `^5.7.3`.
  - `@formspec/eslint-plugin`: `eslint` peer dependency raised from `^9.0.0` to `^9.39.2`.

  Internal only (devDependencies): `vitest` aligned to `^3.2.4` across all packages; `@microsoft/api-extractor` upgraded to `^7.58.7` (latest 7.x, now bundling TypeScript 5.9.3).

  Consumers already on TypeScript 5.7+ and ESLint 9.39+ are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade.

- [#398](https://github.com/mike-north/formspec/pull/398) [`5225a45`](https://github.com/mike-north/formspec/commit/5225a45631dad8b38a088a330c5aa5665519f29b) Thanks [@mike-north](https://github.com/mike-north)! - Fix path-targeted built-in constraint tags so they participate in custom-type broadening. `@exclusiveMinimum :amount 0` on a `MonetaryAmount` field whose `amount` is a registered Decimal now emits the broadened custom-constraint keyword (e.g. `decimalExclusiveMinimum: "0"`) instead of the semantically-invalid raw `exclusiveMinimum: 0` sibling of `$ref`.

  Also unblocks path traversal through nullable intermediates at the IR level — `@minimum :money.amount 0` on `LineItem { money: MonetaryAmount | null }` now resolves cleanly, closing an asymmetry with the compiler-backed TS resolver that already stripped nullable unions.

  The snapshot consumer used by `@formspec/ts-plugin` and `@formspec/language-server` will receive the same fix in a follow-up (#396); until then, IDE diagnostics for path-targeted constraints on custom types remain unbroadened.

- [#393](https://github.com/mike-north/formspec/pull/393) [`a6df78a`](https://github.com/mike-north/formspec/commit/a6df78a75b75afc8942ad86856ad750ba9ff39da) Thanks [@mike-north](https://github.com/mike-north)! - Phase 4 Slice D — canary audit + acceptance-gate grounding.

  Updates `constraint-canaries.test.ts` with accurate Phase 4D audit commentary for all 13
  remaining `.fails` canaries — identifying the two root causes (snapshot-path Role-B capability
  check gap, IR-validation gap in snapshot consumer) and marking them as Phase 5 targets.
  One canary (`@pattern on string[]`) is relabeled as intentional: `supportsConstraintCapability`
  in the build path treats `string[]` as string-like for `@pattern`, so neither consumer emits
  `TYPE_MISMATCH`. The test is retained as a regression guard only.

  Updates `parity-harness.test.ts` KNOWN_DIVERGENCES to note that the alias-chain divergence
  (#363) was reviewed and deferred in Phase 4D.

  No behavior change: 0 canaries flipped. The 13 remaining `.fails` cases require Phase 5
  (snapshot-path Role-B host-checker guard, or full synthetic-checker retirement) to resolve.

  Per the repo's changeset policy, any change under `packages/<name>/src` triggers a patch bump
  for that package and all transitively-dependent packages, even when the change is
  test-comment-only and produces no behavioral difference.

- [#399](https://github.com/mike-north/formspec/pull/399) [`0e79231`](https://github.com/mike-north/formspec/commit/0e79231c25403802d7e426fb6ca0b6db6017cc81) Thanks [@mike-north](https://github.com/mike-north)! - Port host-checker capability guard + placement pre-check to snapshot consumer

  Closes 8 Role-B silent-acceptance bugs tracked in #326. The snapshot consumer
  now runs the same `_supportsConstraintCapability` and `getMatchingTagSignatures`
  checks the build consumer already used, emitting `TYPE_MISMATCH` and
  `INVALID_TAG_PLACEMENT` at the same correctness boundary. Prerequisite for
  Phase 5C deletion of the synthetic machinery.

- [#400](https://github.com/mike-north/formspec/pull/400) [`6e1dfbe`](https://github.com/mike-north/formspec/commit/6e1dfbeb6f7f42b0dc046b0d55e2cd24dc3a71ee) Thanks [@mike-north](https://github.com/mike-north)! - Snapshot consumer now validates `@const` values against the field type

  Closes the IR-validation gap tracked by 4 canaries in
  `constraint-canaries.test.ts`. The snapshot consumer now runs
  `_checkConstValueAgainstType` in `buildTagDiagnostics` after Role-C
  accepts the parsed JSON value, emitting `TYPE_MISMATCH` for primitive
  value/type mismatches and non-matching enum members — matching the build
  consumer's `semantic-targets.ts` `case "const"` behavior. No behavior
  change in the build consumer.

- [#403](https://github.com/mike-north/formspec/pull/403) [`5ae85f5`](https://github.com/mike-north/formspec/commit/5ae85f51ed89b17f25a55f2d9a7fed44a8ba76dd) Thanks [@mike-north](https://github.com/mike-north)! - Phase 5 Slice C follow-up — ordering fix, test migration, and cleanup (addresses panel review of #401).

  Three targeted changes following the Phase 5 Slice C synthetic-checker retirement:

  **Role-A/B ordering fix (`packages/analysis/src/file-snapshots.ts`)**
  Hoists the Role-A placement pre-check (`getMatchingTagSignatures`) above the
  `isBuiltinConstraintName` guard in the snapshot consumer's `buildTagDiagnostics`. The
  build consumer already ran Role A → Role B → Role C in the correct order; the snapshot
  consumer was checking Role B (capability guard) first for built-in constraint tags,
  diverging from the guaranteed execution sequence. The parity-harness proxy in
  `parity-harness.test.ts` is corrected to match, and a new type-alias fixture pins the A→B
  ordering for the "misplaced + type-incompatible" case.

  **Narrow-applicability migration tests (`packages/analysis/src/__tests__/non-constraint-tag-dispatch.test.ts`)**
  Adds 101 migration tests restoring coverage removed when the synthetic-checker module was
  deleted. Coverage includes: 96 parametric tests (16 non-constraint tags × 6 field-type
  shapes = zero diagnostics each), 3 unknown-tag silent-ignore tests, and 2 nullable-intermediate
  path-traversal tests.

  **Auto-fixable cleanup from panel review**
  - `packages/build/src/analyzer/tsdoc-parser.ts`: Rename `SYNTHETIC_TYPE_FORMAT_FLAGS` → `TYPE_FORMAT_FLAGS`; remove stale "before the synthetic-checker call" comment block
  - `ARCHITECTURE.md`: Update DEBUG namespace from `:synthetic` to `:registry`
  - `e2e/benchmarks/README.md`: Delete stale section documenting the deleted benchmark file
  - `packages/ts-plugin/src/semantic-service.ts`: Document the intentional no-op `updateStatsFromPerformanceEvents` method
  - `e2e/benchmarks/stripe-realistic-tsserver-bench.ts`: Mark `syntheticCompileCount` as `@deprecated`
  - `packages/analysis/src/lru-cache.ts` + tests: Delete (zero in-source consumers after retirement)

- [#405](https://github.com/mike-north/formspec/pull/405) [`d70c0b0`](https://github.com/mike-north/formspec/commit/d70c0b0414eb1630b5593ebe0a22a9e3dc3c2d0a) Thanks [@mike-north](https://github.com/mike-north)! - Raise the `typescript` minimum from `^5.7.3` to `^5.9.3` for the workspace packages that declare a `typescript` peer or runtime dependency, so those packages advertise TypeScript 5.9 as their supported baseline. The other packages listed in this changeset receive a patch bump because they are part of the repo's linked version group.

  Consumer-visible:
  - `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised to `^5.9.3`.
  - `@formspec/cli`: `typescript` runtime dependency raised to `^5.9.3`.
  - `@formspec/config`, `@formspec/dsl`, `@formspec/language-server`, `@formspec/runtime`, `@formspec/validator`, and `formspec`: patch bumps only, with no direct `typescript` dependency range change in this changeset.

  Consumers already on TypeScript 5.9 are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade where applicable.

- Updated dependencies [[`f0929c6`](https://github.com/mike-north/formspec/commit/f0929c60e7f74db7da6cffd589a8daaa5ba1e834), [`5225a45`](https://github.com/mike-north/formspec/commit/5225a45631dad8b38a088a330c5aa5665519f29b), [`a6df78a`](https://github.com/mike-north/formspec/commit/a6df78a75b75afc8942ad86856ad750ba9ff39da), [`0e79231`](https://github.com/mike-north/formspec/commit/0e79231c25403802d7e426fb6ca0b6db6017cc81), [`6e1dfbe`](https://github.com/mike-north/formspec/commit/6e1dfbeb6f7f42b0dc046b0d55e2cd24dc3a71ee), [`5ae85f5`](https://github.com/mike-north/formspec/commit/5ae85f51ed89b17f25a55f2d9a7fed44a8ba76dd), [`8f41a9f`](https://github.com/mike-north/formspec/commit/8f41a9f992de04b25477d70ea139ff3ef47db98a), [`d70c0b0`](https://github.com/mike-north/formspec/commit/d70c0b0414eb1630b5593ebe0a22a9e3dc3c2d0a)]:
  - @formspec/analysis@0.1.0-alpha.60
  - @formspec/build@0.1.0-alpha.60
  - @formspec/config@0.1.0-alpha.60

## 0.1.0-alpha.59

### Patch Changes

- [#390](https://github.com/mike-north/formspec/pull/390) [`42f0898`](https://github.com/mike-north/formspec/commit/42f08983f68ee488d2b4a16c26ee6f15308a2767) Thanks [@mike-north](https://github.com/mike-north)! - Document `@format` inheritance through `extends` heritage in `docs/002-tsdoc-grammar.md`. The new "Inheritance through `extends` heritage" subsection under `@format` covers the inheritable-kinds allow-list, heritage-clause scope (`extends` yes, `implements` no), the "nearest annotation by BFS wins, ties broken by declaration order" precedence rule, empty-payload non-override semantics, a worked asymmetric-diamond example, and known limitations (derived-side type-alias case tracked in #374; allow-list expansion tracked in #380). No code change.

- [#359](https://github.com/mike-north/formspec/pull/359) [`90434b6`](https://github.com/mike-north/formspec/commit/90434b64a631ba4c909d9f9a0455d10ffdb8d34d) Thanks [@mike-north](https://github.com/mike-north)! - Fix `@defaultValue` on custom-type fields emitting a value whose runtime type does not conform to the field's JSON Schema type.

  For example, `@defaultValue 9.99` on a `Decimal` field (which maps to `{ type: "string" }`) previously produced `{ "default": 9.99 }` — a numeric default on a string-typed schema. The build pipeline now coerces the parsed literal through the custom-type registration before emitting it as the JSON Schema `default` keyword.

  Coercion strategy (in priority order):
  1. **Explicit hook**: if the `CustomTypeRegistration` provides a `serializeDefault` function, it is called with the parsed literal and the type payload. Extensions needing bespoke serialization (e.g., Date → ISO-8601 string) should use this hook.
  2. **Inference fallback**: when no `serializeDefault` hook is present, the pipeline inspects the `type` keyword returned by `toJsonSchema`. If the emitted type is `"string"` and the parsed literal is a `number`, `boolean`, or `bigint`, it is coerced to a string. Other literal shapes (including objects and arrays) are left unchanged unless an explicit `serializeDefault` hook handles them.
  3. **Pass-through**: non-custom types are unaffected; custom types without a matching registration are also passed through unchanged, as are custom-type literals not covered by the inference fallback.

- [#365](https://github.com/mike-north/formspec/pull/365) [`90e415b`](https://github.com/mike-north/formspec/commit/90e415b8c57f78fab7e8781df5d82914756f66fc) Thanks [@mike-north](https://github.com/mike-north)! - Fix unnecessary `allOf` composition when field-level constraints or annotations are applied to `$ref`-based types. JSON Schema 2020-12 (§10.2.1) allows sibling keywords next to `$ref`, so the generator now emits `{ "$ref": "#/$defs/X", "properties": {...} }` directly instead of wrapping in `allOf`. This preserves `$defs` deduplication and produces output that downstream renderers can consume without needing to unwrap `allOf` as a workaround.

- [#373](https://github.com/mike-north/formspec/pull/373) [`0e3ca17`](https://github.com/mike-north/formspec/commit/0e3ca175bcc530fb1ab0fcf488134a19e836484f) Thanks [@mike-north](https://github.com/mike-north)! - Add dedicated regression coverage for issue #366 — path-targeted constraints on missing properties of inline object schemas now consistently emit a flat `{ type: "object", properties: { ...existing, newProp: ... } }` with no `allOf` wrapper, including when the base is closed (`additionalProperties: false`). The emission-policy change itself was made in the broader #382 Site 1 fix; this adds spec-grounded tests covering nested paths, array-wrapped inline objects, and nullable-union branches.

- [#386](https://github.com/mike-north/formspec/pull/386) [`d70b55e`](https://github.com/mike-north/formspec/commit/d70b55e82027c76faa3d4459428f8fe5c547c9d6) Thanks [@mike-north](https://github.com/mike-north)! - Fix `@format` annotation inheritance through type-alias derivation chains (issue #374). When a type alias is derived from another type (`type WorkEmail = BaseEmail`, `type AliasedMonetary = MonetaryAmount`), the derived alias now preserves its own `$defs` identity and inherits `@format` from the base type's declaration chain. Explicit `@format` on the derived alias overrides the inherited value, matching the semantics of interface-extends inheritance from issue #367.

- [#385](https://github.com/mike-north/formspec/pull/385) [`0892d3b`](https://github.com/mike-north/formspec/commit/0892d3b37d7312b8ca260aa007238dea4fab5a3c) Thanks [@mike-north](https://github.com/mike-north)! - Fix `@format` inheritance when an interface (or class) `extends` a type-alias base. The BFS walker in `collectInheritedTypeAnnotations` previously enqueued only `ClassDeclaration` and `InterfaceDeclaration` bases, silently dropping any `TypeAliasDeclaration` base whose resolved type is object-shaped. The walker now also traverses type-alias bases, extracting JSDoc annotations from them and, when the alias's RHS is a named type, continuing up the heritage chain through the alias.

- [#388](https://github.com/mike-north/formspec/pull/388) [`4419d24`](https://github.com/mike-north/formspec/commit/4419d24016bbce71c32dbeb872ccda6cc372564e) Thanks [@mike-north](https://github.com/mike-north)! - Clarify the precedence rule documented in the heritage-annotation inheritance tests: the actual rule is "nearest annotation by BFS wins, with ties broken by declaration order in the `extends` clause", not "first-listed `extends` wins in every case". Adds an asymmetric-diamond (Case D) regression test pinning the behavior so a future refactor cannot silently flip resolution. No emitter behavior changes.

- [#389](https://github.com/mike-north/formspec/pull/389) [`78c97e1`](https://github.com/mike-north/formspec/commit/78c97e15cabc2623480450143ca03b7e2380108d) Thanks [@mike-north](https://github.com/mike-north)! - Flatten remaining `allOf` emission sites in the JSON Schema emitter to sibling keywords under JSON Schema 2020-12 (§10.2.1), so downstream renderers (e.g., the Stripe dashboard) that do not unwrap `allOf` no longer silently drop path-targeted overrides.
  - **Inline-object missing-property fallback**: when a path-target override names a property not declared on an inline-object base, the override is now merged into the base's `properties` as siblings (with `additionalProperties`/`type` preserved), instead of wrapping the base in `allOf`.
  - **Pre-composed `allOf` append**: when the base schema is already an `allOf` with a single member whose keys do not conflict with the override, the composition is flattened to siblings. `allOf` is retained only when the composition genuinely cannot be expressed as siblings (multiple members, or key collisions).

  Follow-up to #364/#365; closes #382.

- [#357](https://github.com/mike-north/formspec/pull/357) [`ddfaca6`](https://github.com/mike-north/formspec/commit/ddfaca6d6838e09d88a1715685c182d72982b5f5) Thanks [@mike-north](https://github.com/mike-north)! - Fix `hasExtensionBroadening` to use NoTruncation when matching extension type names, preventing false INVALID_TAG_ARGUMENT on complex types (Copilot follow-up on PR #354).

- [#369](https://github.com/mike-north/formspec/pull/369) [`abc56dc`](https://github.com/mike-north/formspec/commit/abc56dc390f280cfef9ee72eaf2c3e9683065ccb) Thanks [@mike-north](https://github.com/mike-north)! - Fix type-level `@format` inheritance on derived interfaces and classes (issue #367). When an interface or class extends a base that declares a type-level `@format`, the derived type's `$defs` entry now carries the inherited `format` keyword. Explicit `@format` on the derived type continues to win over the inherited value.

- [#356](https://github.com/mike-north/formspec/pull/356) [`4716b37`](https://github.com/mike-north/formspec/commit/4716b37494f56c7d110cae6c3ef9ab4a130d45da) Thanks [@mike-north](https://github.com/mike-north)! - Fix `enumSerialization` handling after the smart-size release by validating malformed per-package overrides in `formspec.config.*` files and by making the CLI honor package-scoped `enumSerialization` overrides when generating schemas. `@formspec/build` no longer constructs an empty extension registry when a caller passes a config with `extensions: []`, so a resolved config can be handed to schema generation without paying for registry setup that was never configured.

- [#354](https://github.com/mike-north/formspec/pull/354) [`5cb3433`](https://github.com/mike-north/formspec/commit/5cb3433d1b209304a021620fd3891554db339ed7) Thanks [@mike-north](https://github.com/mike-north)! - Wire typed argument parser into snapshot consumer (Phase 3)

  Routes the snapshot consumer's Role C (argument-literal validation)
  through parseTagArgument. The synthetic TypeScript checker still handles
  Roles A/B/D1/D2 until Phase 4. Fixes the snapshot-side subset of
  silent-acceptance bugs tracked in #326 and completes normalization of
  build/snapshot divergences #329/#330 that Phase 2 began. Implements §4
  Phase 3 of docs/refactors/synthetic-checker-retirement.md.

- [#361](https://github.com/mike-north/formspec/pull/361) [`af895d4`](https://github.com/mike-north/formspec/commit/af895d4a7aa923d0bd8f41731157dbe8db5a992f) Thanks [@mike-north](https://github.com/mike-north)! - Phase 4 Slice A+B — integer-brand bypass parity + shared argument-text extraction
  - Closes #325: snapshot consumer now has the same isIntegerBrandedType bypass
    as the build consumer. Build+snapshot fully converge on integer-branded
    types; the KNOWN DIVERGENCE entries from Phase 0.5c are promoted to
    asserted-equal.
  - Resolves Copilot review finding from PRs #348 and #354: extracts
    extractEffectiveArgumentText to a shared helper in @formspec/analysis
    (main entry, @internal tag). Both consumers now derive argument text
    identically, correctly handling TAGS_REQUIRING_RAW_TEXT compiler-API
    fallback.

  Implements §4 Phase 4 Slice A+B of docs/refactors/synthetic-checker-retirement.md.

- [#384](https://github.com/mike-north/formspec/pull/384) [`87fac02`](https://github.com/mike-north/formspec/commit/87fac024c7cda6340b4b15644dcdae7979ce1099) Thanks [@mike-north](https://github.com/mike-north)! - Relocate setup diagnostics to registry construction time.

  `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` and `SYNTHETIC_SETUP_FAILURE` diagnostics are now emitted exactly once per `createExtensionRegistry` call (build consumer) or `buildFormSpecAnalysisFileSnapshot` call (snapshot consumer), anchored at the extension registration site (`surface: "extension"`, line 1, column 0). Previously, these diagnostics fired on every tag-application validation call, bypassing the LRU cache entirely.

- [#392](https://github.com/mike-north/formspec/pull/392) [`f195a58`](https://github.com/mike-north/formspec/commit/f195a580b03e3b60193f5183374cd95ba42b7d15) Thanks [@mike-north](https://github.com/mike-north)! - Restore emission of `TYPE_MISMATCH` diagnostics for batch-level synthetic TypeScript errors.

  The Phase 4 Slice C refactor (#384) unintentionally dropped the emission of `kind: "typescript"` diagnostics from `batchCheck.globalDiagnostics` — any TypeScript diagnostic produced by the synthetic check that had no source position or fell outside every tag application's line range was silently dropped instead of surfacing as `TYPE_MISMATCH`. This restores the emission via a new `_mapGlobalSyntheticTsDiagnostics` helper, anchored at a span covering every tag application in the batch. Setup-kind globals continue to be pre-emitted at the file-level span by the snapshot entry path and are filtered out of this secondary emission to prevent double-surface.

- [#372](https://github.com/mike-north/formspec/pull/372) [`23b4977`](https://github.com/mike-north/formspec/commit/23b497729defcaa5e909223dd97a055e20d077f0) Thanks [@mike-north](https://github.com/mike-north)! - Strengthen NoTruncation regression coverage with anonymous-intersection case

  Follow-up to PR #357. The prior `LongIntersection` test used a named alias —
  TypeScript's `typeToString` renders those identically with or without
  `NoTruncation`, so the test passed pre- and post-fix, providing zero regression
  coverage. This adds an anonymous-intersection fixture (276 chars `NoTruncation`
  vs 228 chars default — structurally different) that actually demonstrates the
  fix. Verified by reverting the fix locally: the new test fails as expected.

  Also clarifies the null-guard comment in `hasExtensionBroadening` and softens
  the specific character-count claim (the truncation threshold varies by type
  structure).

- [#375](https://github.com/mike-north/formspec/pull/375) [`3a90e08`](https://github.com/mike-north/formspec/commit/3a90e08c522dca31776f7c718261ab465b764208) Thanks [@mike-north](https://github.com/mike-north)! - Add test-only regression coverage for issue #367 and skipped markers for issue #374. One passing bug-report-verbatim test and four `it.skip` tests for the type-alias derivation gap live in `packages/build/src/__tests__/format-inheritance-derived-types.test.ts`. No published-package behavior changes; the patch bumps are required by the changesets workflow for any touched `packages/build` file.

- Updated dependencies [[`42f0898`](https://github.com/mike-north/formspec/commit/42f08983f68ee488d2b4a16c26ee6f15308a2767), [`90434b6`](https://github.com/mike-north/formspec/commit/90434b64a631ba4c909d9f9a0455d10ffdb8d34d), [`90e415b`](https://github.com/mike-north/formspec/commit/90e415b8c57f78fab7e8781df5d82914756f66fc), [`0e3ca17`](https://github.com/mike-north/formspec/commit/0e3ca175bcc530fb1ab0fcf488134a19e836484f), [`d70b55e`](https://github.com/mike-north/formspec/commit/d70b55e82027c76faa3d4459428f8fe5c547c9d6), [`0892d3b`](https://github.com/mike-north/formspec/commit/0892d3b37d7312b8ca260aa007238dea4fab5a3c), [`4419d24`](https://github.com/mike-north/formspec/commit/4419d24016bbce71c32dbeb872ccda6cc372564e), [`78c97e1`](https://github.com/mike-north/formspec/commit/78c97e15cabc2623480450143ca03b7e2380108d), [`ddfaca6`](https://github.com/mike-north/formspec/commit/ddfaca6d6838e09d88a1715685c182d72982b5f5), [`abc56dc`](https://github.com/mike-north/formspec/commit/abc56dc390f280cfef9ee72eaf2c3e9683065ccb), [`4716b37`](https://github.com/mike-north/formspec/commit/4716b37494f56c7d110cae6c3ef9ab4a130d45da), [`5cb3433`](https://github.com/mike-north/formspec/commit/5cb3433d1b209304a021620fd3891554db339ed7), [`af895d4`](https://github.com/mike-north/formspec/commit/af895d4a7aa923d0bd8f41731157dbe8db5a992f), [`87fac02`](https://github.com/mike-north/formspec/commit/87fac024c7cda6340b4b15644dcdae7979ce1099), [`f195a58`](https://github.com/mike-north/formspec/commit/f195a580b03e3b60193f5183374cd95ba42b7d15), [`23b4977`](https://github.com/mike-north/formspec/commit/23b497729defcaa5e909223dd97a055e20d077f0), [`3a90e08`](https://github.com/mike-north/formspec/commit/3a90e08c522dca31776f7c718261ab465b764208)]:
  - @formspec/build@0.1.0-alpha.59
  - @formspec/core@0.1.0-alpha.59
  - @formspec/analysis@0.1.0-alpha.59
  - @formspec/config@0.1.0-alpha.59

## 0.1.0-alpha.58

### Patch Changes

- [#351](https://github.com/mike-north/formspec/pull/351) [`e990b87`](https://github.com/mike-north/formspec/commit/e990b87372ac97819386a914ca2b7a30e4b50f47) Thanks [@mike-north](https://github.com/mike-north)! - Fix `tag-recognition/no-unknown-tags` and `tag-recognition/tsdoc-comment-syntax` rejecting extension-registered annotation tags (e.g. `@primaryField`). Both rules now iterate `extension.annotations` in addition to `constraintTags` and `metadataSlots`.

- [#348](https://github.com/mike-north/formspec/pull/348) [`2ae6463`](https://github.com/mike-north/formspec/commit/2ae646331ef90f3e7b04ee5db117abae3d4e3a62) Thanks [@mike-north](https://github.com/mike-north)! - Wire typed argument parser into the build consumer (Phase 2)

  Calls `parseTagArgument` inside `buildCompilerBackedConstraintDiagnostics`
  (tsdoc-parser.ts) so Role-C argument-literal validation runs before the
  synthetic TypeScript checker. Invalid arguments (hex literals, non-array
  `@enumOptions`, etc.) now produce `INVALID_TAG_ARGUMENT` diagnostics from
  the typed parser rather than `TYPE_MISMATCH` from the synthetic checker.

  Also normalises the `@minimum Infinity` / `@minimum NaN` build/snapshot
  divergence (§3): `renderSyntheticArgumentExpression` now passes these
  values through as TypeScript identifiers instead of JSON-quoted strings,
  so both consumers accept them without producing a diagnostic. Exports
  `parseTagArgument` and friends from `@formspec/analysis/internal` and
  adds `getTypedParserLogger` to the constraint-validator-logger surface.

- Updated dependencies [[`2ae6463`](https://github.com/mike-north/formspec/commit/2ae646331ef90f3e7b04ee5db117abae3d4e3a62)]:
  - @formspec/analysis@0.1.0-alpha.58
  - @formspec/build@0.1.0-alpha.58

## 0.1.0-alpha.57

### Patch Changes

- [#346](https://github.com/mike-north/formspec/pull/346) [`21cbc51`](https://github.com/mike-north/formspec/commit/21cbc511427361709f6ebdac7fb27ff8ab3257db) Thanks [@mike-north](https://github.com/mike-north)! - Tighten Array.isArray narrowing in parseEnumOptionsArgument (#345)

  Re-bind to `unknown[]` after `Array.isArray` so the `isJsonValue`
  predicate narrows soundly to `JsonValue[]` rather than relying on the
  `any` escape hatch. No behavior change.

- Updated dependencies [[`21cbc51`](https://github.com/mike-north/formspec/commit/21cbc511427361709f6ebdac7fb27ff8ab3257db)]:
  - @formspec/analysis@0.1.0-alpha.57
  - @formspec/build@0.1.0-alpha.57

## 0.1.0-alpha.56

### Patch Changes

- [#337](https://github.com/mike-north/formspec/pull/337) [`188677c`](https://github.com/mike-north/formspec/commit/188677c5bfc1866915aa20cfcd1e8fd1339148c7) Thanks [@mike-north](https://github.com/mike-north)! - Add typed argument parser skeleton (Phase 1 Slice 0)

  Introduces `packages/analysis/src/tag-argument-parser.ts` with the public API,
  tag-family registry, and dispatch stub. Per-family parser bodies are filled
  in by Slices A/B/C; canary tests land in Slice D. This is a no-wiring change —
  consumers (`tsdoc-parser.ts`, `file-snapshots.ts`) keep calling the synthetic
  path as before. Implements §4 "Phase 1" + §9.4 0.5j carryover of
  `docs/refactors/synthetic-checker-retirement.md`.

- [#342](https://github.com/mike-north/formspec/pull/342) [`66ffe88`](https://github.com/mike-north/formspec/commit/66ffe88f753c2b3aa151599393f20a1a08ba06dd) Thanks [@mike-north](https://github.com/mike-north)! - Implement numeric + length family argument parsers (Phase 1 Slice A)

  Fills in the two `throw throwNotImplemented` sites in tag-argument-parser.ts
  for the numeric (`@minimum`, `@maximum`, `@exclusiveMinimum`,
  `@exclusiveMaximum`, `@multipleOf`) and length (`@minLength`, `@maxLength`,
  `@minItems`, `@maxItems`) constraint-tag families. Pins current behavior
  for `Infinity`/`NaN`/non-integer values per §3 of the retirement plan. No
  consumer wiring — `tsdoc-parser.ts` and `file-snapshots.ts` keep calling
  the synthetic path.

- [#341](https://github.com/mike-north/formspec/pull/341) [`fd38117`](https://github.com/mike-north/formspec/commit/fd38117411652704f2469764cf22f88ee7efe1a9) Thanks [@mike-north](https://github.com/mike-north)! - Implement boolean-marker + string-opaque family argument parsers (Phase 1 Slice B)

  Fills in the `throw throwNotImplemented` sites in tag-argument-parser.ts
  for `@uniqueItems` (boolean-marker) and `@pattern` (string-opaque).
  Preserves current opaque-string behavior for `@pattern` (no regex
  compilation) per §6 risk 2 of the retirement plan. No consumer wiring.

- [#340](https://github.com/mike-north/formspec/pull/340) [`b8aa714`](https://github.com/mike-north/formspec/commit/b8aa714d050c49cd059ecccb9e57c5bf43c024eb) Thanks [@mike-north](https://github.com/mike-north)! - Implement json-array + json-value-with-fallback family argument parsers (Phase 1 Slice C)

  Fills in the `throwNotImplemented` sites in `tag-argument-parser.ts` for
  `@enumOptions` (JSON array) and `@const` (JSON value with raw-string
  fallback). Introduces an `isJsonValue` type guard so element validation
  is sound, not a cast. Narrows `JSON.parse` catches to `SyntaxError`.
  Preserves heterogeneity in `@enumOptions` and the raw-string fallback
  path for `@const` per §1.6 of the retirement plan and Phase 0.5e/0.5f
  pinning tests. Includes a pinning test for Issue #327 (parseTagSyntax
  newline truncation). No consumer wiring.

- [#344](https://github.com/mike-north/formspec/pull/344) [`a70fbaf`](https://github.com/mike-north/formspec/commit/a70fbafd5282cbc172184ef4c41eca1535683b56) Thanks [@mike-north](https://github.com/mike-north)! - Add canary + registry-sweep tests for the typed argument parser (Phase 1 Slice D)

  Rounds out Phase 1 with cross-family invariant tests, silent-acceptance
  canaries (tied to Issue #326), an exhaustive 13×3 registry sweep, and
  expanded "Expected " prefix coverage across all 6 families. Closes out
  the Phase 1 checklist per §4 of the retirement plan; Phase 2 (build
  consumer wiring) is now unblocked.

- [#343](https://github.com/mike-north/formspec/pull/343) [`6081427`](https://github.com/mike-north/formspec/commit/60814270e6f6a0e24258590020129f907f4b89f9) Thanks [@mike-north](https://github.com/mike-north)! - Add `enumSerialization: "smart-size"` for compact enum output that preserves distinct labels only when needed.

- Updated dependencies [[`188677c`](https://github.com/mike-north/formspec/commit/188677c5bfc1866915aa20cfcd1e8fd1339148c7), [`66ffe88`](https://github.com/mike-north/formspec/commit/66ffe88f753c2b3aa151599393f20a1a08ba06dd), [`fd38117`](https://github.com/mike-north/formspec/commit/fd38117411652704f2469764cf22f88ee7efe1a9), [`b8aa714`](https://github.com/mike-north/formspec/commit/b8aa714d050c49cd059ecccb9e57c5bf43c024eb), [`a70fbaf`](https://github.com/mike-north/formspec/commit/a70fbafd5282cbc172184ef4c41eca1535683b56), [`6081427`](https://github.com/mike-north/formspec/commit/60814270e6f6a0e24258590020129f907f4b89f9)]:
  - @formspec/analysis@0.1.0-alpha.56
  - @formspec/build@0.1.0-alpha.56
  - @formspec/config@0.1.0-alpha.56

## 0.1.0-alpha.55

### Minor Changes

- [#313](https://github.com/mike-north/formspec/pull/313) [`a59effe`](https://github.com/mike-north/formspec/commit/a59effefdf7d59ecbed7e51cb241f9ddfdd8649d) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Remove `extractPayload` from `CustomTypeRegistration`. The callback was added in #300 for `Ref<T>` support but is no longer needed — #308 fixes the underlying stack overflow by skipping full expansion of large external type arguments, allowing formspec's existing object resolution and discriminator pipeline to handle `Ref<T>` correctly.

### Patch Changes

- [#316](https://github.com/mike-north/formspec/pull/316) [`e716db4`](https://github.com/mike-north/formspec/commit/e716db401c6bc64b7cf6590d86b4256018b1d892) Thanks [@mike-north](https://github.com/mike-north)! - Add parity-harness log schema and diffing helper (Phase 0.5m)

  Introduces two new test-internal helpers in `packages/analysis/src/__tests__/helpers/`:
  - `parity-log-entry.ts` — the `ParityLogEntry` TypeScript type (with `RoleOutcome` union) and an `isParityLogEntry` runtime type-guard that validates the full shape including the optional `diagnostic` sub-object.
  - `diff-parity-logs.ts` — `diffParityLogs(buildEntries, snapshotEntries): ParityDivergence[]`, a deterministic diffing function that normalizes entries by `tag + placement + subjectTypeKind` and reports three categories of divergence: one-sided missing entries, differing `roleOutcome` values, and differing diagnostic `code` values.

  These helpers are not exported from the package; they are consumed by the cross-consumer parity harness (Phase 0.5a).

  Implements §8.3e and §9.4 item 0.5m of `docs/refactors/synthetic-checker-retirement.md`.

- [#319](https://github.com/mike-north/formspec/pull/319) [`57437ff`](https://github.com/mike-north/formspec/commit/57437ffa65381db44876480a79482f8e6edf78ac) Thanks [@mike-north](https://github.com/mike-north)! - Fix optional shared type aliases not being deduplicated into `$defs`

  Named string-union enum types used as optional properties (`currency?: Currency`) were being
  inlined at every usage site instead of being placed in `$defs` and referenced via `$ref`.
  The same issue also affected optional properties that referenced shared non-generic object-shape
  aliases.

  Root cause: TypeScript synthesizes `T | undefined` for optional properties, and the synthesized
  type can lose the `aliasSymbol` from the original alias. The class-analyzer relied on
  `aliasSymbol` to register named types in the `typeRegistry`, so affected optional fields were
  never registered and were inlined instead.

  Fix: when `aliasSymbol` is absent on a synthesized optional-property type, fall back to
  inspecting the source node's type annotation via `getReferencedTypeAliasDeclaration`. If the
  annotation references a supported type alias, the alias name and declaration are recovered and
  used to register the type normally in the `typeRegistry`. This recovery now applies to union
  aliases and non-generic object-shape aliases, while still excluding generic aliases and
  primitive/branded aliases.

  This prevents generated schemas from ballooning in size when large enum types (e.g. 157 ISO
  4217 currency codes) are used as optional properties across multiple fields, and also means
  optional shared object aliases are deduplicated into `$defs` instead of being repeatedly inlined.

  Additionally fixes a follow-on regression where recovering a self-referential alias for an
  optional property (e.g. `node?: Tree` with `Tree = { children?: Tree[] }`) would overwrite the
  real `$defs.Tree` body with a dangling self-reference. The recovery path now preserves any
  body that the inner resolver has already finalized instead of replacing it.

- [#308](https://github.com/mike-north/formspec/pull/308) [`50b972b`](https://github.com/mike-north/formspec/commit/50b972b1f2d0922a1b4029f0aab4cebd535eb88e) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Fix stack overflow when a generic type's type argument references a large external type (e.g., `Ref<Stripe.Customer>` where `Customer` has 100+ nested properties). Type arguments from external modules are now emitted as opaque references instead of being recursively expanded, since they are only used for `$defs` naming and don't contribute to the schema output.

- [#315](https://github.com/mike-north/formspec/pull/315) [`685b041`](https://github.com/mike-north/formspec/commit/685b041e19bcde50bbe9955e91c6b3d7978847aa) Thanks [@mike-north](https://github.com/mike-north)! - Add snapshot-path test coverage for the integer-brand bypass scenarios (phase 0.5c). Mirrors the 7 build-path scenarios from `integer-type.test.ts` through `buildFormSpecAnalysisFileSnapshot`, pinning current divergences with `KNOWN DIVERGENCE` comments so regressions can be detected in either direction.

- [#312](https://github.com/mike-north/formspec/pull/312) [`e10233a`](https://github.com/mike-north/formspec/commit/e10233ab15f849fccdcf7fdd31d32574864b31da) Thanks [@mike-north](https://github.com/mike-north)! - Omit redundant `title` in `oneOf` enum serialization when title equals the `const` value.

  When using `enumSerialization: "oneOf"`, members with no `@displayName` (or a `@displayName` identical to the value) previously emitted `{ "const": "USD", "title": "USD" }`. The `title` is now omitted in those cases, producing the more compact `{ "const": "USD" }`. A `title` is still emitted when an explicit `@displayName` differs from the value (e.g. `{ "const": "EUR", "title": "Euro" }`).

  This reduces serialized schema size significantly for large enums — approximately 13 characters saved per member (~2,000 characters for a 157-member ISO 4217 currency enum).

- [#317](https://github.com/mike-north/formspec/pull/317) [`2d9b399`](https://github.com/mike-north/formspec/commit/2d9b399f0e7e0ebd3c902af433f209aeb6903a90) Thanks [@mike-north](https://github.com/mike-north)! - Add pinned regression tests for three known build/snapshot consumer divergences (`@const not-json`, `@minimum Infinity`, `@minimum NaN`). These tests anchor Phase 2/3 normalization work in the synthetic-checker retirement plan.

- [#324](https://github.com/mike-north/formspec/pull/324) [`8c17b53`](https://github.com/mike-north/formspec/commit/8c17b53c2bd03d24c027c24c2f6c7168137a313d) Thanks [@mike-north](https://github.com/mike-north)! - Add cross-consumer parity harness (Phase 0.5a, §9.1 #1)

  Introduces `packages/analysis/src/__tests__/parity-harness.test.ts`, a parametric fixture suite (tag × subject type × argument shape) that runs both the build and snapshot consumers on each input and asserts either diagnostic equality or a known-divergence entry. The `KNOWN_DIVERGENCES` list pins the three catalogued lowering differences from §3 of the refactor plan plus the integer-brand snapshot gap surfaced in #315.

  Consumes the parity-log schema + diff helper from #316.

  Test-only change; no source modifications.

- [#323](https://github.com/mike-north/formspec/pull/323) [`5ae592a`](https://github.com/mike-north/formspec/commit/5ae592a4dae2dccf152098e9df86289ac2935562) Thanks [@mike-north](https://github.com/mike-north)! - Add two constraint-tag fixtures to the ts-plugin test harness (Phase 0.5b, §9.1 #2).

- [#322](https://github.com/mike-north/formspec/pull/322) [`7dcc602`](https://github.com/mike-north/formspec/commit/7dcc60268bac47b0c0e44a58960a53fa7cdaea5b) Thanks [@mike-north](https://github.com/mike-north)! - Pin setup-diagnostic primaryLocation (Phase 0.5d, §9.1 #4). Anchors for Phase 4 relocation.

- [#314](https://github.com/mike-north/formspec/pull/314) [`bb33834`](https://github.com/mike-north/formspec/commit/bb33834f259a4c9f3249445d3a96ae590063cb24) Thanks [@mike-north](https://github.com/mike-north)! - Add edge-case behavior-pin tests for `@const` raw-string fallback (Phase 0.5e). Covers invalid number-like input, multi-line JSON truncation, trailing-comma arrays, Unicode escape sequences, and empty-after-trim payloads.

- [#321](https://github.com/mike-north/formspec/pull/321) [`6370ca6`](https://github.com/mike-north/formspec/commit/6370ca6814e888453474269912a2a934c21430d6) Thanks [@mike-north](https://github.com/mike-north)! - Pin orphaned raw-text-fallback behavior (Phase 0.5g, §9.3 #17).

- [#320](https://github.com/mike-north/formspec/pull/320) [`6e32145`](https://github.com/mike-north/formspec/commit/6e32145284cf76bb3c4b97fe9a7a8ecd5ba2a54e) Thanks [@mike-north](https://github.com/mike-north)! - Pin setup-diagnostic emission-count stability (Phase 0.5h, §9.3 #19).

- [#305](https://github.com/mike-north/formspec/pull/305) [`bcff56c`](https://github.com/mike-north/formspec/commit/bcff56c8b3ae83f61f4978905500a7ea8cf3dc3f) Thanks [@mike-north](https://github.com/mike-north)! - Add structured constraint-validator debug logging (Phase 0-A)

  Implements §8.3a–8.3d and §8.3f from the synthetic-checker retirement plan:
  - Introduces the `formspec:analysis:constraint-validator` namespace family with
    sub-namespaces `:build`, `:snapshot`, `:typed-parser`, `:synthetic`, and
    `:broadening` in a new `constraint-validator-logger.ts` module in
    `@formspec/analysis`.
  - Emits one structured log entry per constraint-tag application (§8.3b) from
    both the build consumer (`tsdoc-parser.ts`) and the snapshot consumer
    (`file-snapshots.ts`). Each entry includes `consumer`, `tag`, `placement`,
    `subjectTypeKind`, `roleOutcome` (A-pass/A-reject/B-pass/B-reject/C-pass/
    C-reject/D1/D2/bypass), and `elapsedMicros`.
  - Logs extension-registry construction events and synthetic batch setup
    diagnostics at `debug` level (§8.3c).
  - Logs `resolvePayload` invocations with `extensionId`, `customTypeName`, and
    `tsApisTouched` flag at the custom-type resolution site in `class-analyzer.ts`
    (§8.3d; `tsApisTouched: false` until PR #300 lands).
  - Adds a "Debugging constraint validation" section to `ARCHITECTURE.md` (§8.3f)
    documenting `DEBUG=formspec:analysis:constraint-validator:*` usage and the
    structured log-entry schema.

  Enable with `DEBUG=formspec:analysis:constraint-validator:*`. No behavior changes.

- [#318](https://github.com/mike-north/formspec/pull/318) [`8bc8299`](https://github.com/mike-north/formspec/commit/8bc82994bf9362125e18fff9ee368628af2bcebb) Thanks [@mike-north](https://github.com/mike-north)! - Add silent-acceptance canary tests (Phase 0.5j, refactor plan S.9.3 #14). 25 negative-only test cases across @minimum, @enumOptions, @pattern, @uniqueItems, and @const identify pre-existing gaps where the analysis pipeline accepts invalid arguments without emitting a diagnostic.

- Updated dependencies [[`e716db4`](https://github.com/mike-north/formspec/commit/e716db401c6bc64b7cf6590d86b4256018b1d892), [`57437ff`](https://github.com/mike-north/formspec/commit/57437ffa65381db44876480a79482f8e6edf78ac), [`50b972b`](https://github.com/mike-north/formspec/commit/50b972b1f2d0922a1b4029f0aab4cebd535eb88e), [`685b041`](https://github.com/mike-north/formspec/commit/685b041e19bcde50bbe9955e91c6b3d7978847aa), [`e10233a`](https://github.com/mike-north/formspec/commit/e10233ab15f849fccdcf7fdd31d32574864b31da), [`2d9b399`](https://github.com/mike-north/formspec/commit/2d9b399f0e7e0ebd3c902af433f209aeb6903a90), [`8c17b53`](https://github.com/mike-north/formspec/commit/8c17b53c2bd03d24c027c24c2f6c7168137a313d), [`5ae592a`](https://github.com/mike-north/formspec/commit/5ae592a4dae2dccf152098e9df86289ac2935562), [`7dcc602`](https://github.com/mike-north/formspec/commit/7dcc60268bac47b0c0e44a58960a53fa7cdaea5b), [`bb33834`](https://github.com/mike-north/formspec/commit/bb33834f259a4c9f3249445d3a96ae590063cb24), [`6370ca6`](https://github.com/mike-north/formspec/commit/6370ca6814e888453474269912a2a934c21430d6), [`6e32145`](https://github.com/mike-north/formspec/commit/6e32145284cf76bb3c4b97fe9a7a8ecd5ba2a54e), [`bcff56c`](https://github.com/mike-north/formspec/commit/bcff56c8b3ae83f61f4978905500a7ea8cf3dc3f), [`a59effe`](https://github.com/mike-north/formspec/commit/a59effefdf7d59ecbed7e51cb241f9ddfdd8649d), [`8bc8299`](https://github.com/mike-north/formspec/commit/8bc82994bf9362125e18fff9ee368628af2bcebb)]:
  - @formspec/analysis@0.1.0-alpha.55
  - @formspec/build@0.1.0-alpha.55
  - @formspec/core@0.1.0-alpha.55
  - @formspec/config@0.1.0-alpha.55

## 0.1.0-alpha.54

### Minor Changes

- [#300](https://github.com/mike-north/formspec/pull/300) [`7288e3b`](https://github.com/mike-north/formspec/commit/7288e3b105fa49a23db18eb0dda504b0da898239) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Add optional `extractPayload` callback to `CustomTypeRegistration`. When defined, the callback is invoked during type analysis with the TypeScript type and checker, and its return value is stored as the custom type node's `payload`. This payload is then passed to `toJsonSchema` during schema generation, enabling extensions to carry type-level information (e.g., a generic argument's resolved literal value) through to JSON Schema output.

### Patch Changes

- Updated dependencies [[`7288e3b`](https://github.com/mike-north/formspec/commit/7288e3b105fa49a23db18eb0dda504b0da898239)]:
  - @formspec/core@0.1.0-alpha.54
  - @formspec/build@0.1.0-alpha.54
  - @formspec/analysis@0.1.0-alpha.54
  - @formspec/config@0.1.0-alpha.54

## 0.1.0-alpha.53

### Minor Changes

- [#298](https://github.com/mike-north/formspec/pull/298) [`9987858`](https://github.com/mike-north/formspec/commit/9987858929d9101c8b4a7ea6b272d14c21cb7f32) Thanks [@mike-north](https://github.com/mike-north)! - Add pino-based debug logging with a `DEBUG=formspec:*` enable convention.

  Apps (`@formspec/cli`, the `@formspec/build` CLI, and `@formspec/language-server`) construct pino loggers inline and route output to stderr, stderr, and the LSP connection console respectively. `@formspec/ts-plugin` wraps `ts.server.Logger` via `fromTsLogger` so diagnostics flow through the tsserver log file instead of stdio.

  Libraries (`@formspec/build`, `@formspec/analysis`, `@formspec/runtime`, `@formspec/config`) now accept an optional `logger?: LoggerLike` on their public entry points, defaulting to a silent no-op. They never import pino directly, so consumers do not pick up pino as a transitive dependency.

  `@formspec/core` exports the shared `LoggerLike` interface, `noopLogger` constant, and the `isNamespaceEnabled` matcher used across all apps. The umbrella `formspec` package re-exports `LoggerLike` and `noopLogger`.

### Patch Changes

- [#297](https://github.com/mike-north/formspec/pull/297) [`bd36d8f`](https://github.com/mike-north/formspec/commit/bd36d8fb0af1d7aae34d5910054b8671a44f7b20) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Fix constraint validation on sibling fields when an interface contains an imported type. Previously, an interface like `{ year: Integer; vin: string }` where `Integer` was imported from another module would be entirely excluded from the synthetic checker's supporting declarations. This caused spurious TYPE_MISMATCH errors on string constraint tags (`@minLength`, `@maxLength`) applied to non-imported sibling fields.

  The synthetic program now rewrites imported member types to `unknown` instead of dropping the entire interface, preserving type context for non-imported siblings.

- Updated dependencies [[`bd36d8f`](https://github.com/mike-north/formspec/commit/bd36d8fb0af1d7aae34d5910054b8671a44f7b20), [`9987858`](https://github.com/mike-north/formspec/commit/9987858929d9101c8b4a7ea6b272d14c21cb7f32)]:
  - @formspec/build@0.1.0-alpha.53
  - @formspec/core@0.1.0-alpha.53
  - @formspec/analysis@0.1.0-alpha.53
  - @formspec/config@0.1.0-alpha.53

## 0.1.0-alpha.52

### Patch Changes

- [#295](https://github.com/mike-north/formspec/pull/295) [`f065dd5`](https://github.com/mike-north/formspec/commit/f065dd598ec3cc1f9fb4e9e169e85728462bb9bd) Thanks [@mike-north](https://github.com/mike-north)! - Internal: add regression tests covering the synthetic `__result` wrapper rename under an inferring field-level `apiName` metadata policy (guards the fix in `@formspec/build`'s `toStandaloneJsonSchema`).

- Updated dependencies [[`eb67977`](https://github.com/mike-north/formspec/commit/eb67977e2174117e27f7fbff61a803a3df75bda4), [`f065dd5`](https://github.com/mike-north/formspec/commit/f065dd598ec3cc1f9fb4e9e169e85728462bb9bd)]:
  - @formspec/build@0.1.0-alpha.52
  - @formspec/analysis@0.1.0-alpha.52

## 0.1.0-alpha.51

### Minor Changes

- [#292](https://github.com/mike-north/formspec/pull/292) [`0b0c725`](https://github.com/mike-north/formspec/commit/0b0c725edf316f6959a26d8b8c5ec835a2b79441) Thanks [@mike-north](https://github.com/mike-north)! - Add `formspec/tag-recognition/tsdoc-comment-syntax` ESLint rule as a drop-in replacement for `tsdoc/syntax`

  **@formspec/eslint-plugin:**
  - New `tag-recognition/tsdoc-comment-syntax` rule that validates TSDoc comment syntax using FormSpec's TSDoc configuration
  - Suppresses false positives on raw-text FormSpec tag payloads (`@pattern` regex values, `@enumOptions` JSON arrays, `@defaultValue` JSON objects) — fixes the false positive reported in issue #291
  - Enabled as `"error"` in both `recommended` and `strict` configs
  - Provides equivalent coverage to `tsdoc/syntax` from `eslint-plugin-tsdoc` without the false positives on FormSpec-annotated files
  - See README section "Replacing `tsdoc/syntax`" for migration guidance

  **@formspec/analysis:**
  - Export `getOrCreateTSDocParser` from the `@formspec/analysis/internal` subpath

### Patch Changes

- Updated dependencies [[`0b0c725`](https://github.com/mike-north/formspec/commit/0b0c725edf316f6959a26d8b8c5ec835a2b79441)]:
  - @formspec/analysis@0.1.0-alpha.51
  - @formspec/build@0.1.0-alpha.51

## 0.1.0-alpha.50

### Patch Changes

- [#289](https://github.com/mike-north/formspec/pull/289) [`fc4e10f`](https://github.com/mike-north/formspec/commit/fc4e10fe9047a69268450792d6fb8141b48df586) Thanks [@mike-north](https://github.com/mike-north)! - Fix TYPE_MISMATCH false positives for path-targeted constraints on any extension-registered custom type, and consolidate duplicated custom-type resolution.
  - Path-targeted built-in constraint tags (e.g. `@exclusiveMinimum :amount 0`) now defer to the IR-layer validator when the resolved sub-type is an extension-registered custom type with broadening for the tag — previously the compiler-backed validator rejected them as capability mismatches.
  - Detection covers all three registration mechanisms: `tsTypeNames` (name), `brand` (structural brand identifiers), and symbol-based registration from `defineCustomType<T>()`. The deferral is tag-aware: only tags with broadening registered on the resolved custom type skip the capability check. Unrelated tags (e.g., `@pattern` on a numeric `Decimal`) still reject via the capability layer.
  - The two branches of `buildCompilerBackedConstraintDiagnostics` (path-targeted vs. direct field) are now structurally symmetric — both resolve the type once, check broadening, then run a unified capability check.
  - `@formspec/analysis/internal` now exports `stripNullishUnion` — the single source of truth for `T | null`/`T | undefined` collapsing used across the analysis and build layers.
  - `class-analyzer.ts`'s private three-resolver chain (`resolveRegisteredCustomType` / `resolveSymbolBasedCustomType` / `resolveBrandedCustomType`) is replaced by a single call to the new shared helper in `@formspec/build/src/extensions/resolve-custom-type.ts`.

  No public API changes. The shared helpers are internal to `@formspec/build`.

- Updated dependencies [[`fc4e10f`](https://github.com/mike-north/formspec/commit/fc4e10fe9047a69268450792d6fb8141b48df586)]:
  - @formspec/analysis@0.1.0-alpha.50
  - @formspec/build@0.1.0-alpha.50

## 0.1.0-alpha.49

### Patch Changes

- [#284](https://github.com/mike-north/formspec/pull/284) [`9e79d05`](https://github.com/mike-north/formspec/commit/9e79d05767270ba4f646c96f49b49c2ecdba447f) Thanks [@mike-north](https://github.com/mike-north)! - Surface Promise-unwrap failures and map `void` to null in schema generation.
  - `unwrapPromiseType` now throws a descriptive error when `checker.getAwaitedType` fails to unwrap a `Promise<T>`-shaped return type. Previously the payload would silently degrade to `{ type: "string" }`; this commonly occurred when the TypeScript compiler host could not locate its default lib files (e.g. after bundling `typescript` with esbuild), as described in #256.
  - `void` types (e.g. `void`, `Promise<void>` return types) now map to `{ type: "null" }`, matching the treatment of `undefined`. Previously `void` fell through to the string fallback and was indistinguishable from an actual `string` return type (#257).

- [#283](https://github.com/mike-north/formspec/pull/283) [`c4513d6`](https://github.com/mike-north/formspec/commit/c4513d631ea19d029a4cf1282c688f7d18127d32) Thanks [@mike-north](https://github.com/mike-north)! - Improve `TYPE_MISMATCH` diagnostics: when a constraint like `@exclusiveMinimum` is applied to an object field whose type contains a subfield that satisfies the constraint's required capability, the error now includes a `Hint:` showing the corrected path-targeted syntax (e.g., `@exclusiveMinimum :value 0`). When multiple subfields qualify, the hint lists them.

- Updated dependencies [[`9e79d05`](https://github.com/mike-north/formspec/commit/9e79d05767270ba4f646c96f49b49c2ecdba447f), [`c4513d6`](https://github.com/mike-north/formspec/commit/c4513d631ea19d029a4cf1282c688f7d18127d32)]:
  - @formspec/build@0.1.0-alpha.49

## 0.1.0-alpha.48

### Patch Changes

- [#285](https://github.com/mike-north/formspec/pull/285) [`1f30e00`](https://github.com/mike-north/formspec/commit/1f30e0091e6cfec2014dca84554b79b40310051b) Thanks [@mike-north](https://github.com/mike-north)! - Fix toStandaloneJsonSchema failing when metadata policy renames the synthetic \_\_result field

- Updated dependencies [[`1f30e00`](https://github.com/mike-north/formspec/commit/1f30e0091e6cfec2014dca84554b79b40310051b)]:
  - @formspec/build@0.1.0-alpha.48

## 0.1.0-alpha.47

### Patch Changes

- [#281](https://github.com/mike-north/formspec/pull/281) [`b58a0f3`](https://github.com/mike-north/formspec/commit/b58a0f3176016a1740c371470cb9c68eb063ec2d) Thanks [@mike-north](https://github.com/mike-north)! - Fix spurious field-type rejections for non-constraint tags across all non-constraint categories.

  Tags like `@displayName`, `@group`, `@example`, `@remarks`, and `@see` accept a typed argument (usually a string) but describe or decorate a declaration — they are not field-type constraints. `buildExtraTagDefinition` previously derived `capabilities` from the tag's value-kind, so every one of these tags inherited a stray field-type requirement (e.g., `@displayName` → `["string-like"]`), which the `tag-type-check` ESLint rule and the narrow synthetic applicability check both surfaced as a rejection on non-matching fields (objects, numbers, booleans, branded `Integer`, etc.).

  `buildExtraTagDefinition` now emits `capabilities: []` for every non-constraint category (`annotation`, `structure`, `ecosystem`) — only `constraint`-category tags (the built-ins in `BUILTIN_TAG_DEFINITIONS`) carry a field-type capability. `buildExtensionMetadataTagDefinition` is aligned to the same invariant.

  Affected tags that previously produced false positives: `@displayName`, `@description`, `@format`, `@placeholder`, `@order`, `@apiName`, `@group`, `@example`, `@remarks`, `@see`.

- [#278](https://github.com/mike-north/formspec/pull/278) [`812a279`](https://github.com/mike-north/formspec/commit/812a2793a30c759bf71e3ca3d87775a0df408f23) Thanks [@mike-north](https://github.com/mike-north)! - Add Ref<T> JSON Schema serialization tests covering phantom property exclusion, discriminator specialization, oneOf serialization, and apiNamePrefix behavior.

- Updated dependencies [[`b58a0f3`](https://github.com/mike-north/formspec/commit/b58a0f3176016a1740c371470cb9c68eb063ec2d), [`812a279`](https://github.com/mike-north/formspec/commit/812a2793a30c759bf71e3ca3d87775a0df408f23)]:
  - @formspec/analysis@0.1.0-alpha.47
  - @formspec/build@0.1.0-alpha.47

## 0.1.0-alpha.46

### Patch Changes

- [#276](https://github.com/mike-north/formspec/pull/276) [`f15fc69`](https://github.com/mike-north/formspec/commit/f15fc69d0d84e253fec6ade8f0d1f040a8e6e862) Thanks [@mike-north](https://github.com/mike-north)! - Export resolveStaticOptions and migrate discovered-schema functions to resolve config internally. Low-level functions (generateSchemasFromDeclaration, generateSchemasFromType, etc.) now support the `config` field on StaticSchemaGenerationOptions, eliminating the need to pass deprecated individual fields.

- Updated dependencies [[`f15fc69`](https://github.com/mike-north/formspec/commit/f15fc69d0d84e253fec6ade8f0d1f040a8e6e862)]:
  - @formspec/build@0.1.0-alpha.46

## 0.1.0-alpha.45

### Patch Changes

- [#273](https://github.com/mike-north/formspec/pull/273) [`1d09fe1`](https://github.com/mike-north/formspec/commit/1d09fe12561002ae3255b66a4e3a9ca32fc078f3) Thanks [@mike-north](https://github.com/mike-north)! - Add `brand` field to `CustomTypeRegistration` for structural type detection via unique symbol brands. More reliable than `tsTypeNames` for aliased branded types because it does not depend on the local type name. Phase 2 of the tsTypeNames deprecation roadmap.

- [#275](https://github.com/mike-north/formspec/pull/275) [`bcdaed6`](https://github.com/mike-north/formspec/commit/bcdaed673ec1f930502087e296dd834a6d8ca602) Thanks [@mike-north](https://github.com/mike-north)! - Add `defineCustomType<T>()` type parameter extraction for symbol-based custom type detection. When a config file uses type parameters, the build pipeline resolves them to ts.Symbol for O(1 identity-based lookup during field analysis — immune to import aliases and name collisions. Mark `tsTypeNames` as deprecated. Phase 3 of the tsTypeNames deprecation roadmap.

- Updated dependencies [[`1d09fe1`](https://github.com/mike-north/formspec/commit/1d09fe12561002ae3255b66a4e3a9ca32fc078f3), [`bcdaed6`](https://github.com/mike-north/formspec/commit/bcdaed673ec1f930502087e296dd834a6d8ca602)]:
  - @formspec/core@0.1.0-alpha.45
  - @formspec/build@0.1.0-alpha.45
  - @formspec/analysis@0.1.0-alpha.45
  - @formspec/config@0.1.0-alpha.45

## 0.1.0-alpha.44

### Patch Changes

- [#270](https://github.com/mike-north/formspec/pull/270) [`1ec2293`](https://github.com/mike-north/formspec/commit/1ec229345f9faadc4449b8a433f25f36d62afc5e) Thanks [@mike-north](https://github.com/mike-north)! - Allow numeric constraint keywords (minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf) in vocabulary-mode custom constraints. Enables Integer custom types to emit standard JSON Schema numeric keywords via emitsVocabularyKeywords.

- [#272](https://github.com/mike-north/formspec/pull/272) [`952785e`](https://github.com/mike-north/formspec/commit/952785ef382c5d5b857f12e35ad3b3f75f34c11f) Thanks [@mike-north](https://github.com/mike-north)! - Add builtin Integer type with `__integerBrand` symbol. Types branded with this symbol produce `{ type: "integer" }` in JSON Schema and accept standard numeric constraints (`@minimum`, `@maximum`, etc.) natively — no extension registration or constraint broadening needed. Re-tighten the vocabulary keyword blocklist now that Integer is handled by the IR pipeline.

- Updated dependencies [[`1ec2293`](https://github.com/mike-north/formspec/commit/1ec229345f9faadc4449b8a433f25f36d62afc5e), [`952785e`](https://github.com/mike-north/formspec/commit/952785ef382c5d5b857f12e35ad3b3f75f34c11f)]:
  - @formspec/build@0.1.0-alpha.44
  - @formspec/core@0.1.0-alpha.44
  - @formspec/analysis@0.1.0-alpha.44
  - @formspec/config@0.1.0-alpha.44

## 0.1.0-alpha.43

### Minor Changes

- [#266](https://github.com/mike-north/formspec/pull/266) [`82604ff`](https://github.com/mike-north/formspec/commit/82604ff886368570a2a0f7ee752ed140418b1932) Thanks [@mike-north](https://github.com/mike-north)! - Exclude `__`-prefixed phantom properties from schema emission, preventing OOM when resolving types like `Ref<Customer>` with large circular type graphs. Add `no-double-underscore-fields` ESLint rule to warn authors about excluded properties.

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Introduce unified `FormSpecConfig` system. Rename `@formspec/constraints` to `@formspec/config`. All consumers (build, CLI, ESLint, language server) now accept a `FormSpecConfig` object carrying extensions, constraints, metadata, vendor prefix, and enum serialization. Adds `defineFormSpecConfig` identity function, `loadFormSpecConfig` with jiti-based TypeScript config file loading, `resolveConfigForFile` for monorepo per-package overrides, and `withConfig()` factory on the ESLint plugin. Removes the outdated playground package. See docs/007-configuration.md for the full spec.

### Patch Changes

- [#31](https://github.com/mike-north/formspec/pull/31) [`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f) Thanks [@mike-north](https://github.com/mike-north)! - Add interactive FormSpec playground with browser-safe package entry points

  **@formspec/playground:**
  - New package with interactive playground for writing and testing FormSpec definitions
  - Real-time TypeScript compilation and schema generation
  - Live form preview with JSON Forms
  - Monaco editor with FormSpec type definitions and autocomplete
  - ESLint integration showing constraint violations in real-time
  - Configurable constraints UI for restricting allowed DSL features
  - Automatically deployed to GitHub Pages

  **@formspec/build:**
  - Add `@formspec/build/browser` entry point for browser environments
  - Excludes Node.js-specific functions like `writeSchemas`
  - Exports `buildFormSchemas`, `generateJsonSchema`, `generateUiSchema`

  **@formspec/constraints:**
  - Add `@formspec/constraints/browser` entry point for browser environments
  - Excludes file-based config loader requiring Node.js APIs
  - Exports `loadConfigFromString`, `defineConstraints`, validators

  **@formspec/eslint-plugin:**
  - Update constraint rules to import from browser-safe entry points

- [#268](https://github.com/mike-north/formspec/pull/268) [`da45909`](https://github.com/mike-north/formspec/commit/da459096da0dad2054e54a17ca71785d179dd71e) Thanks [@mike-north](https://github.com/mike-north)! - Add enum member completions for `@displayName` and `@apiName` `:member` target syntax on string literal union fields.

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Fix TYPE_MISMATCH false positive when built-in numeric constraints (`@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`) are applied to custom types that register `builtinConstraintBroadenings`. The validator now consults the extension registry before rejecting constraints on non-numeric types.

- [#269](https://github.com/mike-north/formspec/pull/269) [`1f87c94`](https://github.com/mike-north/formspec/commit/1f87c94bdc8be790c3e129d45762577eb73a71f6) Thanks [@mike-north](https://github.com/mike-north)! - Consolidate comment parsers on a unified TSDoc-based parser in @formspec/analysis. ESLint scanner and build package delegate to the unified parser instead of maintaining independent tag detection.

- Updated dependencies [[`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f), [`4a1d3fb`](https://github.com/mike-north/formspec/commit/4a1d3fb26e7d337c69c303b8368c962937360745), [`da45909`](https://github.com/mike-north/formspec/commit/da459096da0dad2054e54a17ca71785d179dd71e), [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c), [`6b373d1`](https://github.com/mike-north/formspec/commit/6b373d151f7b72b08fb8a24a3e823c78d3f5c488), [`1f87c94`](https://github.com/mike-north/formspec/commit/1f87c94bdc8be790c3e129d45762577eb73a71f6), [`82604ff`](https://github.com/mike-north/formspec/commit/82604ff886368570a2a0f7ee752ed140418b1932), [`32acd0b`](https://github.com/mike-north/formspec/commit/32acd0bd686bbdbfc6b05dea2a968406dd4081b9), [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c)]:
  - @formspec/build@0.1.0-alpha.43
  - @formspec/config@0.1.0-alpha.43
  - @formspec/analysis@0.1.0-alpha.43

## 0.1.0-alpha.42

### Patch Changes

- [#260](https://github.com/mike-north/formspec/pull/260) [`bad8e2c`](https://github.com/mike-north/formspec/commit/bad8e2cf8be66983fac49309cbb381b48418f239) Thanks [@mike-north](https://github.com/mike-north)! - Add `emitsVocabularyKeywords` option to `CustomConstraintRegistration` that allows custom constraints to emit non-vendor-prefixed JSON Schema keywords. This enables extensions to define their own JSON Schema vocabulary (e.g., `decimalMinimum`) instead of being forced to namespace under the vendor prefix.

- Updated dependencies [[`bad8e2c`](https://github.com/mike-north/formspec/commit/bad8e2cf8be66983fac49309cbb381b48418f239)]:
  - @formspec/core@0.1.0-alpha.42
  - @formspec/analysis@0.1.0-alpha.42
  - @formspec/constraints@0.1.0-alpha.42

## 0.1.0-alpha.41

### Patch Changes

- [#258](https://github.com/mike-north/formspec/pull/258) [`62f5e2c`](https://github.com/mike-north/formspec/commit/62f5e2cfb34555a16f7d7cd1e50463f61c0711da) Thanks [@mike-north](https://github.com/mike-north)! - Add configurable enum JSON Schema serialization and enum-member display-name policy support.
  - Default labeled enum output to flat `enum` plus a complete `x-<vendor>-display-names` extension
  - Add opt-in `oneOf` enum serialization with `const`/`title` branches
  - Add `metadata.enumMember.displayName` policy configuration for inferred or required enum-member labels
  - Add `--enum-serialization <enum|oneOf>` to the published CLIs
  - Re-export the new enum-member metadata policy types from `@formspec/core`, `@formspec/dsl`, and `formspec`

- Updated dependencies [[`62f5e2c`](https://github.com/mike-north/formspec/commit/62f5e2cfb34555a16f7d7cd1e50463f61c0711da)]:
  - @formspec/analysis@0.1.0-alpha.41
  - @formspec/core@0.1.0-alpha.41
  - @formspec/constraints@0.1.0-alpha.41

## 0.1.0-alpha.38

### Patch Changes

- [#247](https://github.com/mike-north/formspec/pull/247) [`329482b`](https://github.com/mike-north/formspec/commit/329482b3a51685b456050597d4e5c58f5b68d420) Thanks [@aelliott-stripe](https://github.com/aelliott-stripe)! - Fix TS2300 "Duplicate identifier" when a TypeScript global built-in type (e.g. `Date`) is registered as an extension custom type. The synthetic prelude no longer emits `type X = unknown;` for types already declared in TypeScript's lib files, preventing spurious type errors that were misattributed to unrelated tag applications. Unsupported global built-in overrides now surface as a structured `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` diagnostic, and other synthetic setup failures now surface as `SYNTHETIC_SETUP_FAILURE` instead of being collapsed into unrelated tag failures.

- Updated dependencies [[`329482b`](https://github.com/mike-north/formspec/commit/329482b3a51685b456050597d4e5c58f5b68d420)]:
  - @formspec/analysis@0.1.0-alpha.38

## 0.1.0-alpha.37

### Patch Changes

- [#244](https://github.com/mike-north/formspec/pull/244) [`fdfd076`](https://github.com/mike-north/formspec/commit/fdfd07698448ee8895fa42dd9daee4af9a23d775) Thanks [@mike-north](https://github.com/mike-north)! - Expose contextual tag-usage documentation through FormSpec semantic APIs.
  - Add occurrence-filtered `contextualSignatures` to serialized tag semantic context.
  - Add `contextualTagHoverMarkdown` so downstream editor consumers can render FormSpec-owned, context-appropriate tag docs without reproducing applicability filtering logic.

- [#246](https://github.com/mike-north/formspec/pull/246) [`a12ff31`](https://github.com/mike-north/formspec/commit/a12ff31e5ba0f28398bd409bcaf8b635dd68549c) Thanks [@mike-north](https://github.com/mike-north)! - Expose declaration-level semantic summaries for documented declarations and use them for declaration hover payloads.

- Updated dependencies [[`fdfd076`](https://github.com/mike-north/formspec/commit/fdfd07698448ee8895fa42dd9daee4af9a23d775), [`a12ff31`](https://github.com/mike-north/formspec/commit/a12ff31e5ba0f28398bd409bcaf8b635dd68549c)]:
  - @formspec/analysis@0.1.0-alpha.37

## 0.1.0-alpha.34

### Patch Changes

- [#231](https://github.com/mike-north/formspec/pull/231) [`b0137b8`](https://github.com/mike-north/formspec/commit/b0137b807af13890d53fdafcfe849328deb11cb4) Thanks [@mike-north](https://github.com/mike-north)! - Finish `@discriminator` specialization for generic object aliases.
  - `@formspec/build` now supports discriminator specialization for object-like generic type aliases expressed as type literals, parenthesized type literals, intersections, and parenthesized intersections.
  - Discriminator resolution now prefers concrete literal identities exposed on bound types (for example `readonly object: "customer"`) before falling back to resolved metadata, and supports discriminator-only `apiNamePrefix` application for metadata-derived values.
  - `@formspec/eslint-plugin` now accepts discriminator target fields whose types become string-like through generic constraints or base constraints, including object-like type alias intersections.

## 0.1.0-alpha.33

### Minor Changes

- [#227](https://github.com/mike-north/formspec/pull/227) [`63d3b65`](https://github.com/mike-north/formspec/commit/63d3b652c39e39ea8a6c4385fef5f6ac88e7529a) Thanks [@mike-north](https://github.com/mike-north)! - Add shared metadata analysis helpers for existing TypeScript programs, use them in build metadata resolution, and re-export them for downstream ESLint rule authors.

### Patch Changes

- [#229](https://github.com/mike-north/formspec/pull/229) [`f1a3644`](https://github.com/mike-north/formspec/commit/f1a364466c124dd326d7705732c04682f53c7455) Thanks [@aelliott-stripe](https://github.com/aelliott-stripe)! - Fix schema generation when a host interface references an extension-registered custom type: the synthetic program now emits `type X = unknown;` declarations for extension types, so constraint tag validation no longer filters out declarations that reference those types.

- [#228](https://github.com/mike-north/formspec/pull/228) [`abdbcb1`](https://github.com/mike-north/formspec/commit/abdbcb1a001bde9412f3988e42b132a68baa5cbe) Thanks [@mike-north](https://github.com/mike-north)! - Add explicit metadata source mappings to the shared analysis helpers and fix build metadata resolution edge cases around logical-name inference and extension slot qualifier handling.

- [#226](https://github.com/mike-north/formspec/pull/226) [`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata slot registration types and validation plumbing so extensions can define tooling-facing metadata tags and analysis slots across the core/build/analysis stack.

- Updated dependencies [[`f1a3644`](https://github.com/mike-north/formspec/commit/f1a364466c124dd326d7705732c04682f53c7455), [`abdbcb1`](https://github.com/mike-north/formspec/commit/abdbcb1a001bde9412f3988e42b132a68baa5cbe), [`63d3b65`](https://github.com/mike-north/formspec/commit/63d3b652c39e39ea8a6c4385fef5f6ac88e7529a), [`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3)]:
  - @formspec/analysis@0.1.0-alpha.33
  - @formspec/core@0.1.0-alpha.33
  - @formspec/constraints@0.1.0-alpha.33

## 0.1.0-alpha.30

### Patch Changes

- [#209](https://github.com/mike-north/formspec/pull/209) [`10b1207`](https://github.com/mike-north/formspec/commit/10b120714b5e820222fd0b5f0f6f40010977faaa) Thanks [@mike-north](https://github.com/mike-north)! - Document and harden discriminator tooling coverage across analysis and editor integrations.

- Updated dependencies [[`10b1207`](https://github.com/mike-north/formspec/commit/10b120714b5e820222fd0b5f0f6f40010977faaa)]:
  - @formspec/analysis@0.1.0-alpha.30

## 0.1.0-alpha.29

### Patch Changes

- [#206](https://github.com/mike-north/formspec/pull/206) [`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata policy and resolved metadata support across core, the DSL factory surface, and build generation. JSON Schema and UI Schema now honor resolved `apiName` and `displayName`, mixed-authoring merges metadata by explicit-vs-inferred precedence, and discriminator resolution supports literal identity properties plus metadata-driven names for object-like generic sources.

- Updated dependencies [[`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20)]:
  - @formspec/core@0.1.0-alpha.29
  - @formspec/analysis@0.1.0-alpha.29
  - @formspec/constraints@0.1.0-alpha.29

## 0.1.0-alpha.28

### Minor Changes

- [#202](https://github.com/mike-north/formspec/pull/202) [`c8b1358`](https://github.com/mike-north/formspec/commit/c8b1358976b24e30e0d6a588dbcd84a80a106094) Thanks [@mike-north](https://github.com/mike-north)! - Add built-in `@discriminator :fieldName T` support for generic object declarations.
  - `@formspec/build` now preserves generic reference type arguments and specializes discriminator fields to singleton string enums in emitted JSON Schema.
  - `@formspec/analysis`, `@formspec/ts-plugin`, and `@formspec/language-server` now recognize `@discriminator`, provide hover/completion support, and suggest local type parameter names in argument position.
  - `@formspec/eslint-plugin` now validates declaration-level discriminator usage, including duplicate tags, direct-property targeting, local type-parameter operands, and target-field shape checks.

### Patch Changes

- [#199](https://github.com/mike-north/formspec/pull/199) [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf) Thanks [@mike-north](https://github.com/mike-north)! - Declare MIT licensing across package metadata and README documentation.

- Updated dependencies [[`c8b1358`](https://github.com/mike-north/formspec/commit/c8b1358976b24e30e0d6a588dbcd84a80a106094), [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf)]:
  - @formspec/analysis@0.1.0-alpha.28
  - @formspec/constraints@0.1.0-alpha.28
  - @formspec/core@0.1.0-alpha.28

## 0.1.0-alpha.27

### Patch Changes

- [#196](https://github.com/mike-north/formspec/pull/196) [`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd) Thanks [@mike-north](https://github.com/mike-north)! - Tighten API Extractor surface enforcement by promoting forgotten exports to errors and cleaning up leaked public types across analysis, ts-plugin, eslint-plugin, and formspec.

- [#192](https://github.com/mike-north/formspec/pull/192) [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c) Thanks [@mike-north](https://github.com/mike-north)! - Prune public API surface and promote Zod validation schemas

  Move extension authoring types, mixed authoring generator, and implementation-detail types from `@public` to `@internal`. Promote `jsonSchema7Schema`, `uiSchemaSchema`, and the JSON Schema 7 type family to `@public` on the main `@formspec/build` entry point.

- [#195](https://github.com/mike-north/formspec/pull/195) [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827) Thanks [@mike-north](https://github.com/mike-north)! - Tighten exported API surfaces so the published declarations, API Extractor rollups, and generated docs stay aligned.

  This promotes a small set of already-exposed types to supported public exports, replaces a few leaked internal type references with public ones, and keeps the root workspace lint from traversing nested agent worktrees.

- [#194](https://github.com/mike-north/formspec/pull/194) [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030) Thanks [@mike-north](https://github.com/mike-north)! - Repair the public tooling entrypoints after the API rollup refactor and add program-backed schema generation in `@formspec/build`.

- Updated dependencies [[`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd), [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c), [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827), [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030)]:
  - @formspec/analysis@0.1.0-alpha.27
  - @formspec/core@0.1.0-alpha.27
  - @formspec/constraints@0.1.0-alpha.27

## 0.1.0-alpha.26

### Patch Changes

- [#189](https://github.com/mike-north/formspec/pull/189) [`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53) Thanks [@mike-north](https://github.com/mike-north)! - Document previously undocumented exported APIs and enforce API Extractor's
  `ae-undocumented` validation for published package surfaces.
  - Add contributor-facing docs for internal exports and external-facing docs for
    alpha-or-better public APIs.
  - Enable `ae-undocumented` so newly exported APIs must carry TSDoc before they
    can be released.

- Updated dependencies [[`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53)]:
  - @formspec/analysis@0.1.0-alpha.26
  - @formspec/constraints@0.1.0-alpha.26
  - @formspec/core@0.1.0-alpha.26

## 0.1.0-alpha.24

### Minor Changes

- [#182](https://github.com/mike-north/formspec/pull/182) [`8810079`](https://github.com/mike-north/formspec/commit/8810079555d6749d529463e4e98d4bfbb05b940b) Thanks [@dzou-stripe](https://github.com/dzou-stripe)! - Fix ESLint 9 imports by updating lint rule names to be namespaced under formspec/ instead of @formspec/

### Patch Changes

- [#184](https://github.com/mike-north/formspec/pull/184) [`a352685`](https://github.com/mike-north/formspec/commit/a35268575c1685edcf3e9828e6fa13062d957686) Thanks [@mike-north](https://github.com/mike-north)! - Add a configurable rule that strips markdown formatting from selected FormSpec tag values.

## 0.1.0-alpha.23

### Minor Changes

- [#181](https://github.com/mike-north/formspec/pull/181) [`ef268b3`](https://github.com/mike-north/formspec/commit/ef268b37c5e9a0fca0b69d1efecb27315a00a211) Thanks [@mike-north](https://github.com/mike-north)! - Generate API Extractor declaration rollups for the public, beta, alpha, and untrimmed internal release-tag surfaces, and emit matching API report variants for each package.

  The package root `types` entries continue to point at the public rollups, while the additional rollups now exist as build artifacts for tooling, monorepo validation, and future subpath exposure.

- [#178](https://github.com/mike-north/formspec/pull/178) [`e9cdb20`](https://github.com/mike-north/formspec/commit/e9cdb2025fb74dec3f1aab46aa9ebc0c675e45db) Thanks [@mike-north](https://github.com/mike-north)! - Prune the published TypeScript API surface using API Extractor release tags and regenerate API documentation from the trimmed declaration rollups.

  This alpha minor intentionally removes several previously root-exported low-level TypeScript APIs so the published surface matches the supported consumer-facing API.

  Notable removals include:
  - canonical IR and other low-level implementation types from `@formspec/core`
  - low-level IR, validator, and analyzer internals from `@formspec/build`
  - low-level validator helper/defaults APIs from `@formspec/constraints`

  Published consumers should use the stable package-root APIs for supported schema generation flows, including `generateSchemas()`, `generateSchemasFromClass()`, `buildMixedAuthoringSchemas()`, and `createExtensionRegistry()`. Extension authoring remains part of the supported public API. Downstream code using removed low-level root exports should migrate to the stable package-root APIs where possible or, for monorepo-only development, the dedicated internal entrypoints.

  Monorepo packages continue to typecheck against untrimmed local declaration rollups during development, while published consumers now see the intentionally curated public surface.

### Patch Changes

- [#179](https://github.com/mike-north/formspec/pull/179) [`21ecc59`](https://github.com/mike-north/formspec/commit/21ecc59300840e6ca46e5db99fab42e0e8210c72) Thanks [@mike-north](https://github.com/mike-north)! - Fix synthetic checker regressions around imported declarations and compiler option handling.

- Updated dependencies [[`ef268b3`](https://github.com/mike-north/formspec/commit/ef268b37c5e9a0fca0b69d1efecb27315a00a211), [`21ecc59`](https://github.com/mike-north/formspec/commit/21ecc59300840e6ca46e5db99fab42e0e8210c72), [`e9cdb20`](https://github.com/mike-north/formspec/commit/e9cdb2025fb74dec3f1aab46aa9ebc0c675e45db)]:
  - @formspec/analysis@0.1.0-alpha.23
  - @formspec/constraints@0.1.0-alpha.23
  - @formspec/core@0.1.0-alpha.23

## 0.1.0-alpha.22

### Patch Changes

- [#176](https://github.com/mike-north/formspec/pull/176) [`cf6a280`](https://github.com/mike-north/formspec/commit/cf6a2807552c0e330037d79f619da5448ce36cac) Thanks [@mike-north](https://github.com/mike-north)! - Tighten the white-label tooling surface by fixing protocol-type exports,
  preserving canonical diagnostic categories in the LSP adapter, and avoiding
  lingering refresh timers in direct semantic-service hosts.

- [#173](https://github.com/mike-north/formspec/pull/173) [`c6c4b8c`](https://github.com/mike-north/formspec/commit/c6c4b8c196b1eac7f2f5a917463687e2ee40d57b) Thanks [@mike-north](https://github.com/mike-north)! - Add white-label hybrid tooling composition APIs.
  - enrich FormSpec analysis diagnostics with structured category, related-location, and raw data fields for white-label consumers
  - add public `FormSpecSemanticService` APIs to `@formspec/ts-plugin` so downstream TypeScript hosts can reuse the same `Program`
  - add public diagnostics retrieval and LSP conversion helpers to `@formspec/language-server`, with the packaged server acting as the reference implementation
  - publish downstream packages with compatible dependency bumps for the new analysis-driven tooling surface

- Updated dependencies [[`cf6a280`](https://github.com/mike-north/formspec/commit/cf6a2807552c0e330037d79f619da5448ce36cac), [`c6c4b8c`](https://github.com/mike-north/formspec/commit/c6c4b8c196b1eac7f2f5a917463687e2ee40d57b)]:
  - @formspec/analysis@0.1.0-alpha.22

## 0.1.0-alpha.21

### Minor Changes

- [#172](https://github.com/mike-north/formspec/pull/172) [`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c) Thanks [@mike-north](https://github.com/mike-north)! - Remove @description tag; use TSDoc summary text for JSON Schema description and @remarks for x-vendor-remarks extension keyword

### Patch Changes

- Updated dependencies [[`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c)]:
  - @formspec/core@0.1.0-alpha.21
  - @formspec/analysis@0.1.0-alpha.21
  - @formspec/constraints@0.1.0-alpha.21

## 0.1.0-alpha.20

### Patch Changes

- [#163](https://github.com/mike-north/formspec/pull/163) [`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34) Thanks [@mike-north](https://github.com/mike-north)! - Add semantic comment cursor analysis for FormSpec tags, including richer hover
  content and target-specifier completions for language-server consumers.

- [#165](https://github.com/mike-north/formspec/pull/165) [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d) Thanks [@mike-north](https://github.com/mike-north)! - Integrate compiler-backed comment tag validation into shared analysis and build extraction.

- [#164](https://github.com/mike-north/formspec/pull/164) [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef) Thanks [@mike-north](https://github.com/mike-north)! - Add compiler-backed synthetic tag signature scaffolding for shared FormSpec comment analysis.

- [#161](https://github.com/mike-north/formspec/pull/161) [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95) Thanks [@mike-north](https://github.com/mike-north)! - Centralize FormSpec comment tag analysis and fix shared registry regressions across build, lint, and language-server tooling.

- Updated dependencies [[`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34), [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d), [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef), [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95), [`8b287fb`](https://github.com/mike-north/formspec/commit/8b287fbadf24b7e1a71ae94fb0ce982849f8888c)]:
  - @formspec/analysis@0.1.0-alpha.20

## 0.1.0-alpha.19

### Patch Changes

- [#155](https://github.com/mike-north/formspec/pull/155) [`1df7e34`](https://github.com/mike-north/formspec/commit/1df7e343b4fc17746c9a624ac5339db0071bc187) Thanks [@mike-north](https://github.com/mike-north)! - Release the unpublished follow-up fixes from the spec-parity work.
  - `@formspec/build`: restore generation-time IR validation, respect vendor-prefixed deprecation metadata, keep custom constraint validation working for nullable and array-backed extension types, and align description extraction with the documented `@description` > `@remarks` > summary-text precedence.
  - `@formspec/cli`: pick up the updated build pipeline behavior through the published CLI entrypoint.
  - `@formspec/core`: include the extension and constraint-definition fixes required by the updated build pipeline.
  - `@formspec/eslint-plugin`: fix boolean tag handling so `@uniqueItems` does not require an argument and still participates in type checking, expose plugin metadata consistently for ESLint/doc tooling, and keep generated rule docs in sync with the supported public exports.
  - `formspec`: pick up the updated build and ESLint-plugin behavior through the umbrella package surface.

- Updated dependencies [[`1df7e34`](https://github.com/mike-north/formspec/commit/1df7e343b4fc17746c9a624ac5339db0071bc187)]:
  - @formspec/core@0.1.0-alpha.19
  - @formspec/constraints@0.1.0-alpha.19

## 0.1.0-alpha.18

### Patch Changes

- [#151](https://github.com/mike-north/formspec/pull/151) [`96bd65a`](https://github.com/mike-north/formspec/commit/96bd65a154838597e07d7aabf02619803eac155e) Thanks [@mike-north](https://github.com/mike-north)! - Fix ESLint FormSpec tag parsing so `@pattern` values containing inline `@...` text are handled correctly, and allow `:singular` / `:plural` display-name targets without false-positive member-target errors.

## 0.1.0-alpha.17

### Patch Changes

- Updated dependencies [[`dbc6c21`](https://github.com/mike-north/formspec/commit/dbc6c219be95d9481afa9936eb3b81c7f446fb65)]:
  - @formspec/core@0.1.0-alpha.17
  - @formspec/constraints@0.1.0-alpha.17

## 0.1.0-alpha.16

### Patch Changes

- Updated dependencies [[`d7f10fe`](https://github.com/mike-north/formspec/commit/d7f10fe7d3d855a99423baec3996bebd47f80190), [`889470b`](https://github.com/mike-north/formspec/commit/889470b4b3ab9d4bf9ed72169e083a2887256f57)]:
  - @formspec/core@0.1.0-alpha.16
  - @formspec/constraints@0.1.0-alpha.16

## 0.1.0-alpha.14

### Patch Changes

- [#83](https://github.com/mike-north/formspec/pull/83) [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec) Thanks [@mike-north](https://github.com/mike-north)! - Fix ESLint JSDoc constraint regex: path-targeted constraint tags (e.g., `@minimum :value 0`) are now correctly parsed and no longer trigger false-positive rule violations

- Updated dependencies [[`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec)]:
  - @formspec/core@0.1.0-alpha.14
  - @formspec/constraints@0.1.0-alpha.14

## 0.1.0-alpha.13

### Patch Changes

- Updated dependencies [[`bc76a57`](https://github.com/mike-north/formspec/commit/bc76a57ffe1934c485aec0c9e1143cc5203c429c)]:
  - @formspec/core@0.1.0-alpha.13
  - @formspec/constraints@0.1.0-alpha.13

## 0.1.0-alpha.12

### Minor Changes

- [`4d1b327`](https://github.com/mike-north/formspec/commit/4d1b327b420f52115bcd66367ee901a23b371890) Thanks [@mike-north](https://github.com/mike-north)! - Rewrite build pipeline around Canonical IR with constraint validation and extension API

  **@formspec/core**
  - Add Canonical IR type definitions (`FormIR`, `FieldIR`, `GroupIR`, `ConditionalIR`) and `IR_VERSION` constant
  - Add Extension API types (`ExtensionDefinition`, `ExtensionRegistry`)

  **@formspec/build**
  - Rewrite TSDoc analyzer to produce IR directly (replaces legacy `FormElement` intermediate)
  - Add IR → JSON Schema 2020-12 generator with `$defs`/`$ref` support
  - Add IR → JSON Forms UI Schema generator
  - Wire full pipeline through IR, delete legacy code paths
  - Add constraint validator with contradiction detection
  - Add extension registry and validator integration
  - Add chain DSL and TSDoc parity test suite

  **@formspec/cli**
  - Add `--emit-ir` flag to output Canonical IR
  - Add `--validate-only` flag for schema validation without writing files

  **@formspec/eslint-plugin**
  - Add constraint rule factory for type-aware constraint validation

  **@formspec/playground**
  - Add IR viewer and constraint validation panels

  **@formspec/constraints**
  - Fix constraint propagation through nested class types

  **@formspec/runtime**
  - Adjust exports after decorator DSL removal

  **formspec**
  - Update umbrella re-exports for new public API surface

### Patch Changes

- Updated dependencies [[`4d1b327`](https://github.com/mike-north/formspec/commit/4d1b327b420f52115bcd66367ee901a23b371890)]:
  - @formspec/core@0.1.0-alpha.12
  - @formspec/constraints@0.1.0-alpha.12

## 0.1.0-alpha.11

### Patch Changes

- [#49](https://github.com/mike-north/formspec/pull/49) [`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b) Thanks [@mike-north](https://github.com/mike-north)! - Add dual CJS/ESM builds via tsup and API Extractor for all published packages

  All published packages now ship both ESM (.js) and CJS (.cjs) output, built by tsup. API Extractor generates rolled-up .d.ts declaration files for all 9 packages (previously missing for @formspec/decorators and @formspec/cli).

- Updated dependencies [[`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b)]:
  - @formspec/core@0.1.0-alpha.11
  - @formspec/constraints@0.1.0-alpha.11

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [[`15519c3`](https://github.com/mike-north/formspec/commit/15519c393904ed73748f3de8dd1a07b28cfdcf41)]:
  - @formspec/core@0.1.0-alpha.10
  - @formspec/constraints@0.1.0-alpha.10

## 0.1.0-alpha.9

### Minor Changes

- [#37](https://github.com/mike-north/formspec/pull/37) [`f598436`](https://github.com/mike-north/formspec/commit/f598436187e881d777259e794005bb4980abca21) Thanks [@mike-north](https://github.com/mike-north)! - Redesign @formspec/decorators as marker-only TC39 Stage 3 decorators

  **@formspec/decorators** — Complete rewrite:
  - All decorators are now no-ops (zero runtime overhead, marker-only for CLI static analysis)
  - Uses TC39 Stage 3 decorator signatures (`ClassFieldDecoratorContext`)
  - New decorators: `@Field({ displayName, description?, placeholder?, order? })`, `@Minimum`, `@Maximum`, `@ExclusiveMinimum`, `@ExclusiveMaximum`, `@MinLength`, `@MaxLength`, `@Pattern(RegExp)`
  - Extensibility API: `extendDecorator()` to narrow built-ins, `customDecorator()` to create custom markers/parameterized decorators with `x-formspec-*` schema extensions
  - Brand types via unique symbols for CLI identification through `.d.ts` files
  - Removed: `@Label`, `@Placeholder`, `@Description`, `@Min`, `@Max`, `@Step`, `@MinItems`, `@MaxItems`, `toFormSpec()`, `buildFormSchemas()`, `getDecoratorMetadata()`, `getTypeMetadata()`, and all runtime metadata storage

  **@formspec/build** — Analysis pipeline now lives here:
  - Moved analyzer, generators, and codegen from `@formspec/cli`
  - New high-level `generateSchemasFromClass()` entry point
  - Consolidated JSON Schema types: single `JSONSchema7` family with `ExtendedJSONSchema7` for `x-formspec-*` extensions
  - Brand detection via TypeScript type checker `getProperties()` (not fragile `typeToString` regex)
  - `typescript` is now a peer dependency

  **@formspec/cli** — Thin wrapper importing from `@formspec/build`

  **@formspec/eslint-plugin** — Updated for new decorator names:
  - New rule: `consistent-constraints` (replaces `min-max-valid-range`, adds exclusive bound and conflicting bound checks)
  - New rules: `decorator-allowed-field-types`, `prefer-custom-decorator`
  - Updated: `decorator-field-type-mismatch`, `no-conflicting-decorators`, `no-duplicate-decorators`

### Patch Changes

- Updated dependencies [[`f598436`](https://github.com/mike-north/formspec/commit/f598436187e881d777259e794005bb4980abca21)]:
  - @formspec/core@0.1.0-alpha.9
  - @formspec/constraints@0.1.0-alpha.9

## 0.1.0-alpha.8

### Patch Changes

- [#32](https://github.com/mike-north/formspec/pull/32) [`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98) Thanks [@mike-north](https://github.com/mike-north)! - Fix all ESLint errors and add lint enforcement to CI
  - Fix 213 lint errors across 6 packages (build, cli, decorators, dsl, eslint-plugin, runtime)
  - Add lint step to CI workflow to enforce rules on all future PRs
  - Fixes include: proper null checks, type assertions, array syntax, template literals, and unused variable handling

- Updated dependencies []:
  - @formspec/constraints@0.1.0-alpha.7

## 0.1.0-alpha.7

### Minor Changes

- [#29](https://github.com/mike-north/formspec/pull/29) [`5c3cdbf`](https://github.com/mike-north/formspec/commit/5c3cdbfbb6c10ce80722917decd8d16f496e3202) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/constraints package for defining and enforcing DSL constraints

  **@formspec/constraints:**
  - New package for constraining which FormSpec DSL features are allowed
  - Configure via `.formspec.yml` with field types, layout, and field option constraints
  - Severity levels: `error`, `warn`, `off`
  - Programmatic API for loading config and validating FormSpec definitions
  - JSON Schema for editor autocompletion

  **@formspec/eslint-plugin:**
  - New `constraints-allowed-field-types` rule
  - New `constraints-allowed-layouts` rule
  - Rules automatically load constraints from `.formspec.yml`

### Patch Changes

- [#31](https://github.com/mike-north/formspec/pull/31) [`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f) Thanks [@mike-north](https://github.com/mike-north)! - Add interactive FormSpec playground with browser-safe package entry points

  **@formspec/playground:**
  - New package with interactive playground for writing and testing FormSpec definitions
  - Real-time TypeScript compilation and schema generation
  - Live form preview with JSON Forms
  - Monaco editor with FormSpec type definitions and autocomplete
  - ESLint integration showing constraint violations in real-time
  - Configurable constraints UI for restricting allowed DSL features
  - Automatically deployed to GitHub Pages

  **@formspec/build:**
  - Add `@formspec/build/browser` entry point for browser environments
  - Excludes Node.js-specific functions like `writeSchemas`
  - Exports `buildFormSchemas`, `generateJsonSchema`, `generateUiSchema`

  **@formspec/constraints:**
  - Add `@formspec/constraints/browser` entry point for browser environments
  - Excludes file-based config loader requiring Node.js APIs
  - Exports `loadConfigFromString`, `defineConstraints`, validators

  **@formspec/eslint-plugin:**
  - Update constraint rules to import from browser-safe entry points

- Updated dependencies [[`5c3cdbf`](https://github.com/mike-north/formspec/commit/5c3cdbfbb6c10ce80722917decd8d16f496e3202), [`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f), [`5c3cdbf`](https://github.com/mike-north/formspec/commit/5c3cdbfbb6c10ce80722917decd8d16f496e3202)]:
  - @formspec/constraints@0.1.0-alpha.7

## 0.1.0-alpha.3

### Minor Changes

- [#10](https://github.com/mike-north/formspec/pull/10) [`b713663`](https://github.com/mike-north/formspec/commit/b713663420d23b47d3a5317ab3400a555ebf8cc4) Thanks [@mike-north](https://github.com/mike-north)! - Add ESLint plugin for FormSpec decorator DSL type safety

  This plugin provides compile-time validation for projects using FormSpec's TypeScript decorator DSL. It catches common mistakes by validating that decorators match their field types and enforcing consistency rules.

  **Installation:**

  ```bash
  npm install --save-dev @formspec/eslint-plugin
  ```

  **Usage:**

  ```javascript
  import formspec from "@formspec/eslint-plugin";

  export default [...formspec.configs.recommended];
  ```

  **Rules included:**
  - `decorator-field-type-mismatch`: Validates decorator/field type compatibility (e.g., @Min/@Max on number fields)
  - `enum-options-match-type`: Ensures @EnumOptions values match the field's TypeScript union type
  - `showwhen-field-exists`: Validates @ShowWhen references a field that exists in the class
  - `showwhen-suggests-optional`: Suggests fields with @ShowWhen should be optional
  - `min-max-valid-range`: Ensures @Min/@Max and @MinItems/@MaxItems have valid ranges
  - `no-conflicting-decorators`: Detects decorators that imply conflicting field types
  - `no-duplicate-decorators`: Prevents duplicate decorators on the same field

  **Config presets:**
  - `recommended`: Sensible defaults (showwhen-suggests-optional as warning)
  - `strict`: All rules as errors

  See package README for detailed rule documentation.
