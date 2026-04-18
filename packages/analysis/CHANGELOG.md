# @formspec/analysis

## 0.1.0-alpha.52

### Patch Changes

- [#294](https://github.com/mike-north/formspec/pull/294) [`eb67977`](https://github.com/mike-north/formspec/commit/eb67977e2174117e27f7fbff61a803a3df75bda4) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Fix TYPE_MISMATCH false positives for numeric constraint tags (`@minimum`, `@maximum`, etc.) on integer-branded types imported from another module, including nullable (`Integer | null`) and optional (`score?: Integer`) variants.

  Two independent validation layers needed fixes:
  1. **`tsdoc-parser.ts`** (compiler-backed constraint validation): The synthetic TypeScript program used for validation couldn't resolve imported type names. The `isIntegerBrandedType` bypass now strips nullish unions before checking, so `Integer | null` is handled correctly.
  2. **`semantic-targets.ts`** (IR-level constraint validation): `checkConstraintOnType` checked capabilities against the raw `effectiveType`, which is a `union` IR node for nullable fields. Now unwraps nullable unions to the non-null member before computing type capabilities.

## 0.1.0-alpha.51

### Patch Changes

- [#292](https://github.com/mike-north/formspec/pull/292) [`0b0c725`](https://github.com/mike-north/formspec/commit/0b0c725edf316f6959a26d8b8c5ec835a2b79441) Thanks [@mike-north](https://github.com/mike-north)! - Add `formspec/tag-recognition/tsdoc-comment-syntax` ESLint rule as a drop-in replacement for `tsdoc/syntax`

  **@formspec/eslint-plugin:**
  - New `tag-recognition/tsdoc-comment-syntax` rule that validates TSDoc comment syntax using FormSpec's TSDoc configuration
  - Suppresses false positives on raw-text FormSpec tag payloads (`@pattern` regex values, `@enumOptions` JSON arrays, `@defaultValue` JSON objects) — fixes the false positive reported in issue #291
  - Enabled as `"error"` in both `recommended` and `strict` configs
  - Provides equivalent coverage to `tsdoc/syntax` from `eslint-plugin-tsdoc` without the false positives on FormSpec-annotated files
  - See README section "Replacing `tsdoc/syntax`" for migration guidance

  **@formspec/analysis:**
  - Export `getOrCreateTSDocParser` from the `@formspec/analysis/internal` subpath

## 0.1.0-alpha.50

### Patch Changes

- [#289](https://github.com/mike-north/formspec/pull/289) [`fc4e10f`](https://github.com/mike-north/formspec/commit/fc4e10fe9047a69268450792d6fb8141b48df586) Thanks [@mike-north](https://github.com/mike-north)! - Fix TYPE_MISMATCH false positives for path-targeted constraints on any extension-registered custom type, and consolidate duplicated custom-type resolution.
  - Path-targeted built-in constraint tags (e.g. `@exclusiveMinimum :amount 0`) now defer to the IR-layer validator when the resolved sub-type is an extension-registered custom type with broadening for the tag — previously the compiler-backed validator rejected them as capability mismatches.
  - Detection covers all three registration mechanisms: `tsTypeNames` (name), `brand` (structural brand identifiers), and symbol-based registration from `defineCustomType<T>()`. The deferral is tag-aware: only tags with broadening registered on the resolved custom type skip the capability check. Unrelated tags (e.g., `@pattern` on a numeric `Decimal`) still reject via the capability layer.
  - The two branches of `buildCompilerBackedConstraintDiagnostics` (path-targeted vs. direct field) are now structurally symmetric — both resolve the type once, check broadening, then run a unified capability check.
  - `@formspec/analysis/internal` now exports `stripNullishUnion` — the single source of truth for `T | null`/`T | undefined` collapsing used across the analysis and build layers.
  - `class-analyzer.ts`'s private three-resolver chain (`resolveRegisteredCustomType` / `resolveSymbolBasedCustomType` / `resolveBrandedCustomType`) is replaced by a single call to the new shared helper in `@formspec/build/src/extensions/resolve-custom-type.ts`.

  No public API changes. The shared helpers are internal to `@formspec/build`.

## 0.1.0-alpha.47

### Patch Changes

- [#281](https://github.com/mike-north/formspec/pull/281) [`b58a0f3`](https://github.com/mike-north/formspec/commit/b58a0f3176016a1740c371470cb9c68eb063ec2d) Thanks [@mike-north](https://github.com/mike-north)! - Fix spurious field-type rejections for non-constraint tags across all non-constraint categories.

  Tags like `@displayName`, `@group`, `@example`, `@remarks`, and `@see` accept a typed argument (usually a string) but describe or decorate a declaration — they are not field-type constraints. `buildExtraTagDefinition` previously derived `capabilities` from the tag's value-kind, so every one of these tags inherited a stray field-type requirement (e.g., `@displayName` → `["string-like"]`), which the `tag-type-check` ESLint rule and the narrow synthetic applicability check both surfaced as a rejection on non-matching fields (objects, numbers, booleans, branded `Integer`, etc.).

  `buildExtraTagDefinition` now emits `capabilities: []` for every non-constraint category (`annotation`, `structure`, `ecosystem`) — only `constraint`-category tags (the built-ins in `BUILTIN_TAG_DEFINITIONS`) carry a field-type capability. `buildExtensionMetadataTagDefinition` is aligned to the same invariant.

  Affected tags that previously produced false positives: `@displayName`, `@description`, `@format`, `@placeholder`, `@order`, `@apiName`, `@group`, `@example`, `@remarks`, `@see`.

## 0.1.0-alpha.45

### Patch Changes

- [#273](https://github.com/mike-north/formspec/pull/273) [`1d09fe1`](https://github.com/mike-north/formspec/commit/1d09fe12561002ae3255b66a4e3a9ca32fc078f3) Thanks [@mike-north](https://github.com/mike-north)! - Add `brand` field to `CustomTypeRegistration` for structural type detection via unique symbol brands. More reliable than `tsTypeNames` for aliased branded types because it does not depend on the local type name. Phase 2 of the tsTypeNames deprecation roadmap.

- [#275](https://github.com/mike-north/formspec/pull/275) [`bcdaed6`](https://github.com/mike-north/formspec/commit/bcdaed673ec1f930502087e296dd834a6d8ca602) Thanks [@mike-north](https://github.com/mike-north)! - Add `defineCustomType<T>()` type parameter extraction for symbol-based custom type detection. When a config file uses type parameters, the build pipeline resolves them to ts.Symbol for O(1 identity-based lookup during field analysis — immune to import aliases and name collisions. Mark `tsTypeNames` as deprecated. Phase 3 of the tsTypeNames deprecation roadmap.

- Updated dependencies [[`1d09fe1`](https://github.com/mike-north/formspec/commit/1d09fe12561002ae3255b66a4e3a9ca32fc078f3), [`bcdaed6`](https://github.com/mike-north/formspec/commit/bcdaed673ec1f930502087e296dd834a6d8ca602)]:
  - @formspec/core@0.1.0-alpha.45

## 0.1.0-alpha.44

### Patch Changes

- [#272](https://github.com/mike-north/formspec/pull/272) [`952785e`](https://github.com/mike-north/formspec/commit/952785ef382c5d5b857f12e35ad3b3f75f34c11f) Thanks [@mike-north](https://github.com/mike-north)! - Add builtin Integer type with `__integerBrand` symbol. Types branded with this symbol produce `{ type: "integer" }` in JSON Schema and accept standard numeric constraints (`@minimum`, `@maximum`, etc.) natively — no extension registration or constraint broadening needed. Re-tighten the vocabulary keyword blocklist now that Integer is handled by the IR pipeline.

- Updated dependencies [[`952785e`](https://github.com/mike-north/formspec/commit/952785ef382c5d5b857f12e35ad3b3f75f34c11f)]:
  - @formspec/core@0.1.0-alpha.44

## 0.1.0-alpha.43

### Minor Changes

- [#268](https://github.com/mike-north/formspec/pull/268) [`da45909`](https://github.com/mike-north/formspec/commit/da459096da0dad2054e54a17ca71785d179dd71e) Thanks [@mike-north](https://github.com/mike-north)! - Add enum member completions for `@displayName` and `@apiName` `:member` target syntax on string literal union fields.

- [#269](https://github.com/mike-north/formspec/pull/269) [`1f87c94`](https://github.com/mike-north/formspec/commit/1f87c94bdc8be790c3e129d45762577eb73a71f6) Thanks [@mike-north](https://github.com/mike-north)! - Consolidate comment parsers on a unified TSDoc-based parser in @formspec/analysis. ESLint scanner and build package delegate to the unified parser instead of maintaining independent tag detection.

### Patch Changes

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Fix TYPE_MISMATCH false positive when built-in numeric constraints (`@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`) are applied to custom types that register `builtinConstraintBroadenings`. The validator now consults the extension registry before rejecting constraints on non-numeric types.

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Introduce unified `FormSpecConfig` system. Rename `@formspec/constraints` to `@formspec/config`. All consumers (build, CLI, ESLint, language server) now accept a `FormSpecConfig` object carrying extensions, constraints, metadata, vendor prefix, and enum serialization. Adds `defineFormSpecConfig` identity function, `loadFormSpecConfig` with jiti-based TypeScript config file loading, `resolveConfigForFile` for monorepo per-package overrides, and `withConfig()` factory on the ESLint plugin. Removes the outdated playground package. See docs/007-configuration.md for the full spec.

## 0.1.0-alpha.42

### Patch Changes

- [#260](https://github.com/mike-north/formspec/pull/260) [`bad8e2c`](https://github.com/mike-north/formspec/commit/bad8e2cf8be66983fac49309cbb381b48418f239) Thanks [@mike-north](https://github.com/mike-north)! - Add `emitsVocabularyKeywords` option to `CustomConstraintRegistration` that allows custom constraints to emit non-vendor-prefixed JSON Schema keywords. This enables extensions to define their own JSON Schema vocabulary (e.g., `decimalMinimum`) instead of being forced to namespace under the vendor prefix.

- Updated dependencies [[`bad8e2c`](https://github.com/mike-north/formspec/commit/bad8e2cf8be66983fac49309cbb381b48418f239)]:
  - @formspec/core@0.1.0-alpha.42

## 0.1.0-alpha.41

### Patch Changes

- [#258](https://github.com/mike-north/formspec/pull/258) [`62f5e2c`](https://github.com/mike-north/formspec/commit/62f5e2cfb34555a16f7d7cd1e50463f61c0711da) Thanks [@mike-north](https://github.com/mike-north)! - Add configurable enum JSON Schema serialization and enum-member display-name policy support.
  - Default labeled enum output to flat `enum` plus a complete `x-<vendor>-display-names` extension
  - Add opt-in `oneOf` enum serialization with `const`/`title` branches
  - Add `metadata.enumMember.displayName` policy configuration for inferred or required enum-member labels
  - Add `--enum-serialization <enum|oneOf>` to the published CLIs
  - Re-export the new enum-member metadata policy types from `@formspec/core`, `@formspec/dsl`, and `formspec`

- Updated dependencies [[`62f5e2c`](https://github.com/mike-north/formspec/commit/62f5e2cfb34555a16f7d7cd1e50463f61c0711da)]:
  - @formspec/core@0.1.0-alpha.41

## 0.1.0-alpha.38

### Patch Changes

- [#247](https://github.com/mike-north/formspec/pull/247) [`329482b`](https://github.com/mike-north/formspec/commit/329482b3a51685b456050597d4e5c58f5b68d420) Thanks [@aelliott-stripe](https://github.com/aelliott-stripe)! - Fix TS2300 "Duplicate identifier" when a TypeScript global built-in type (e.g. `Date`) is registered as an extension custom type. The synthetic prelude no longer emits `type X = unknown;` for types already declared in TypeScript's lib files, preventing spurious type errors that were misattributed to unrelated tag applications. Unsupported global built-in overrides now surface as a structured `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` diagnostic, and other synthetic setup failures now surface as `SYNTHETIC_SETUP_FAILURE` instead of being collapsed into unrelated tag failures.

## 0.1.0-alpha.37

### Minor Changes

- [#244](https://github.com/mike-north/formspec/pull/244) [`fdfd076`](https://github.com/mike-north/formspec/commit/fdfd07698448ee8895fa42dd9daee4af9a23d775) Thanks [@mike-north](https://github.com/mike-north)! - Expose contextual tag-usage documentation through FormSpec semantic APIs.
  - Add occurrence-filtered `contextualSignatures` to serialized tag semantic context.
  - Add `contextualTagHoverMarkdown` so downstream editor consumers can render FormSpec-owned, context-appropriate tag docs without reproducing applicability filtering logic.

- [#246](https://github.com/mike-north/formspec/pull/246) [`a12ff31`](https://github.com/mike-north/formspec/commit/a12ff31e5ba0f28398bd409bcaf8b635dd68549c) Thanks [@mike-north](https://github.com/mike-north)! - Expose declaration-level semantic summaries for documented declarations and use them for declaration hover payloads.

## 0.1.0-alpha.33

### Minor Changes

- [#228](https://github.com/mike-north/formspec/pull/228) [`abdbcb1`](https://github.com/mike-north/formspec/commit/abdbcb1a001bde9412f3988e42b132a68baa5cbe) Thanks [@mike-north](https://github.com/mike-north)! - Add explicit metadata source mappings to the shared analysis helpers and fix build metadata resolution edge cases around logical-name inference and extension slot qualifier handling.

- [#227](https://github.com/mike-north/formspec/pull/227) [`63d3b65`](https://github.com/mike-north/formspec/commit/63d3b652c39e39ea8a6c4385fef5f6ac88e7529a) Thanks [@mike-north](https://github.com/mike-north)! - Add shared metadata analysis helpers for existing TypeScript programs, use them in build metadata resolution, and re-export them for downstream ESLint rule authors.

### Patch Changes

- [#229](https://github.com/mike-north/formspec/pull/229) [`f1a3644`](https://github.com/mike-north/formspec/commit/f1a364466c124dd326d7705732c04682f53c7455) Thanks [@aelliott-stripe](https://github.com/aelliott-stripe)! - Fix schema generation when a host interface references an extension-registered custom type: the synthetic program now emits `type X = unknown;` declarations for extension types, so constraint tag validation no longer filters out declarations that reference those types.

- [#226](https://github.com/mike-north/formspec/pull/226) [`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata slot registration types and validation plumbing so extensions can define tooling-facing metadata tags and analysis slots across the core/build/analysis stack.

- Updated dependencies [[`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3)]:
  - @formspec/core@0.1.0-alpha.33

## 0.1.0-alpha.30

### Patch Changes

- [#209](https://github.com/mike-north/formspec/pull/209) [`10b1207`](https://github.com/mike-north/formspec/commit/10b120714b5e820222fd0b5f0f6f40010977faaa) Thanks [@mike-north](https://github.com/mike-north)! - Document and harden discriminator tooling coverage across analysis and editor integrations.

## 0.1.0-alpha.29

### Patch Changes

- [#206](https://github.com/mike-north/formspec/pull/206) [`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata policy and resolved metadata support across core, the DSL factory surface, and build generation. JSON Schema and UI Schema now honor resolved `apiName` and `displayName`, mixed-authoring merges metadata by explicit-vs-inferred precedence, and discriminator resolution supports literal identity properties plus metadata-driven names for object-like generic sources.

- Updated dependencies [[`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20)]:
  - @formspec/core@0.1.0-alpha.29

## 0.1.0-alpha.28

### Minor Changes

- [#202](https://github.com/mike-north/formspec/pull/202) [`c8b1358`](https://github.com/mike-north/formspec/commit/c8b1358976b24e30e0d6a588dbcd84a80a106094) Thanks [@mike-north](https://github.com/mike-north)! - Add built-in `@discriminator :fieldName T` support for generic object declarations.
  - `@formspec/build` now preserves generic reference type arguments and specializes discriminator fields to singleton string enums in emitted JSON Schema.
  - `@formspec/analysis`, `@formspec/ts-plugin`, and `@formspec/language-server` now recognize `@discriminator`, provide hover/completion support, and suggest local type parameter names in argument position.
  - `@formspec/eslint-plugin` now validates declaration-level discriminator usage, including duplicate tags, direct-property targeting, local type-parameter operands, and target-field shape checks.

### Patch Changes

- [#199](https://github.com/mike-north/formspec/pull/199) [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf) Thanks [@mike-north](https://github.com/mike-north)! - Declare MIT licensing across package metadata and README documentation.

- Updated dependencies [[`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf)]:
  - @formspec/core@0.1.0-alpha.28

## 0.1.0-alpha.27

### Patch Changes

- [#196](https://github.com/mike-north/formspec/pull/196) [`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd) Thanks [@mike-north](https://github.com/mike-north)! - Tighten API Extractor surface enforcement by promoting forgotten exports to errors and cleaning up leaked public types across analysis, ts-plugin, eslint-plugin, and formspec.

- [#192](https://github.com/mike-north/formspec/pull/192) [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c) Thanks [@mike-north](https://github.com/mike-north)! - Prune public API surface and promote Zod validation schemas

  Move extension authoring types, mixed authoring generator, and implementation-detail types from `@public` to `@internal`. Promote `jsonSchema7Schema`, `uiSchemaSchema`, and the JSON Schema 7 type family to `@public` on the main `@formspec/build` entry point.

- [#195](https://github.com/mike-north/formspec/pull/195) [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827) Thanks [@mike-north](https://github.com/mike-north)! - Tighten exported API surfaces so the published declarations, API Extractor rollups, and generated docs stay aligned.

  This promotes a small set of already-exposed types to supported public exports, replaces a few leaked internal type references with public ones, and keeps the root workspace lint from traversing nested agent worktrees.

- [#194](https://github.com/mike-north/formspec/pull/194) [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030) Thanks [@mike-north](https://github.com/mike-north)! - Repair the public tooling entrypoints after the API rollup refactor and add program-backed schema generation in `@formspec/build`.

- Updated dependencies [[`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c), [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030)]:
  - @formspec/core@0.1.0-alpha.27

## 0.1.0-alpha.26

### Patch Changes

- [#189](https://github.com/mike-north/formspec/pull/189) [`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53) Thanks [@mike-north](https://github.com/mike-north)! - Document previously undocumented exported APIs and enforce API Extractor's
  `ae-undocumented` validation for published package surfaces.
  - Add contributor-facing docs for internal exports and external-facing docs for
    alpha-or-better public APIs.
  - Enable `ae-undocumented` so newly exported APIs must carry TSDoc before they
    can be released.

- Updated dependencies [[`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53)]:
  - @formspec/core@0.1.0-alpha.26

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

- Updated dependencies [[`ef268b3`](https://github.com/mike-north/formspec/commit/ef268b37c5e9a0fca0b69d1efecb27315a00a211), [`e9cdb20`](https://github.com/mike-north/formspec/commit/e9cdb2025fb74dec3f1aab46aa9ebc0c675e45db)]:
  - @formspec/core@0.1.0-alpha.23

## 0.1.0-alpha.22

### Minor Changes

- [#173](https://github.com/mike-north/formspec/pull/173) [`c6c4b8c`](https://github.com/mike-north/formspec/commit/c6c4b8c196b1eac7f2f5a917463687e2ee40d57b) Thanks [@mike-north](https://github.com/mike-north)! - Add white-label hybrid tooling composition APIs.
  - enrich FormSpec analysis diagnostics with structured category, related-location, and raw data fields for white-label consumers
  - add public `FormSpecSemanticService` APIs to `@formspec/ts-plugin` so downstream TypeScript hosts can reuse the same `Program`
  - add public diagnostics retrieval and LSP conversion helpers to `@formspec/language-server`, with the packaged server acting as the reference implementation
  - publish downstream packages with compatible dependency bumps for the new analysis-driven tooling surface

### Patch Changes

- [#176](https://github.com/mike-north/formspec/pull/176) [`cf6a280`](https://github.com/mike-north/formspec/commit/cf6a2807552c0e330037d79f619da5448ce36cac) Thanks [@mike-north](https://github.com/mike-north)! - Tighten the white-label tooling surface by fixing protocol-type exports,
  preserving canonical diagnostic categories in the LSP adapter, and avoiding
  lingering refresh timers in direct semantic-service hosts.

## 0.1.0-alpha.21

### Patch Changes

- [#172](https://github.com/mike-north/formspec/pull/172) [`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c) Thanks [@mike-north](https://github.com/mike-north)! - Remove @description tag; use TSDoc summary text for JSON Schema description and @remarks for x-vendor-remarks extension keyword

- Updated dependencies [[`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c)]:
  - @formspec/core@0.1.0-alpha.21

## 0.1.0-alpha.20

### Minor Changes

- [#163](https://github.com/mike-north/formspec/pull/163) [`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34) Thanks [@mike-north](https://github.com/mike-north)! - Add semantic comment cursor analysis for FormSpec tags, including richer hover
  content and target-specifier completions for language-server consumers.

- [#165](https://github.com/mike-north/formspec/pull/165) [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d) Thanks [@mike-north](https://github.com/mike-north)! - Integrate compiler-backed comment tag validation into shared analysis and build extraction.

- [#164](https://github.com/mike-north/formspec/pull/164) [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef) Thanks [@mike-north](https://github.com/mike-north)! - Add compiler-backed synthetic tag signature scaffolding for shared FormSpec comment analysis.

- [#161](https://github.com/mike-north/formspec/pull/161) [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95) Thanks [@mike-north](https://github.com/mike-north)! - Centralize FormSpec comment tag analysis and fix shared registry regressions across build, lint, and language-server tooling.

- [#166](https://github.com/mike-north/formspec/pull/166) [`8b287fb`](https://github.com/mike-north/formspec/commit/8b287fbadf24b7e1a71ae94fb0ce982849f8888c) Thanks [@mike-north](https://github.com/mike-north)! - Add the hybrid FormSpec editor architecture built around a tsserver plugin and a lightweight language server.
  - `@formspec/analysis` now exports the serializable protocol, manifest helpers, and file-snapshot data model used across the plugin/LSP boundary.
  - `@formspec/language-server` can enrich hover and completion results over the local plugin transport while degrading cleanly to syntax-only behavior.
  - `@formspec/ts-plugin` provides the TypeScript language service plugin that owns semantic analysis, workspace manifest publishing, and local IPC responses.
