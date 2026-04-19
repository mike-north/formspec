# formspec

## 0.1.0-alpha.54

### Minor Changes

- [#300](https://github.com/mike-north/formspec/pull/300) [`7288e3b`](https://github.com/mike-north/formspec/commit/7288e3b105fa49a23db18eb0dda504b0da898239) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Add optional `extractPayload` callback to `CustomTypeRegistration`. When defined, the callback is invoked during type analysis with the TypeScript type and checker, and its return value is stored as the custom type node's `payload`. This payload is then passed to `toJsonSchema` during schema generation, enabling extensions to carry type-level information (e.g., a generic argument's resolved literal value) through to JSON Schema output.

### Patch Changes

- Updated dependencies [[`7288e3b`](https://github.com/mike-north/formspec/commit/7288e3b105fa49a23db18eb0dda504b0da898239)]:
  - @formspec/core@0.1.0-alpha.54
  - @formspec/build@0.1.0-alpha.54
  - @formspec/dsl@0.1.0-alpha.54
  - @formspec/runtime@0.1.0-alpha.54

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
  - @formspec/runtime@0.1.0-alpha.53
  - @formspec/dsl@0.1.0-alpha.53

## 0.1.0-alpha.52

### Patch Changes

- [#295](https://github.com/mike-north/formspec/pull/295) [`f065dd5`](https://github.com/mike-north/formspec/commit/f065dd598ec3cc1f9fb4e9e169e85728462bb9bd) Thanks [@mike-north](https://github.com/mike-north)! - Internal: add regression tests covering the synthetic `__result` wrapper rename under an inferring field-level `apiName` metadata policy (guards the fix in `@formspec/build`'s `toStandaloneJsonSchema`).

- Updated dependencies [[`eb67977`](https://github.com/mike-north/formspec/commit/eb67977e2174117e27f7fbff61a803a3df75bda4), [`f065dd5`](https://github.com/mike-north/formspec/commit/f065dd598ec3cc1f9fb4e9e169e85728462bb9bd)]:
  - @formspec/build@0.1.0-alpha.52

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

- Updated dependencies [[`0b0c725`](https://github.com/mike-north/formspec/commit/0b0c725edf316f6959a26d8b8c5ec835a2b79441)]:
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
  - @formspec/dsl@0.1.0-alpha.45
  - @formspec/runtime@0.1.0-alpha.45

## 0.1.0-alpha.44

### Patch Changes

- [#270](https://github.com/mike-north/formspec/pull/270) [`1ec2293`](https://github.com/mike-north/formspec/commit/1ec229345f9faadc4449b8a433f25f36d62afc5e) Thanks [@mike-north](https://github.com/mike-north)! - Allow numeric constraint keywords (minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf) in vocabulary-mode custom constraints. Enables Integer custom types to emit standard JSON Schema numeric keywords via emitsVocabularyKeywords.

- [#272](https://github.com/mike-north/formspec/pull/272) [`952785e`](https://github.com/mike-north/formspec/commit/952785ef382c5d5b857f12e35ad3b3f75f34c11f) Thanks [@mike-north](https://github.com/mike-north)! - Add builtin Integer type with `__integerBrand` symbol. Types branded with this symbol produce `{ type: "integer" }` in JSON Schema and accept standard numeric constraints (`@minimum`, `@maximum`, etc.) natively — no extension registration or constraint broadening needed. Re-tighten the vocabulary keyword blocklist now that Integer is handled by the IR pipeline.

- Updated dependencies [[`1ec2293`](https://github.com/mike-north/formspec/commit/1ec229345f9faadc4449b8a433f25f36d62afc5e), [`952785e`](https://github.com/mike-north/formspec/commit/952785ef382c5d5b857f12e35ad3b3f75f34c11f)]:
  - @formspec/build@0.1.0-alpha.44
  - @formspec/core@0.1.0-alpha.44
  - @formspec/dsl@0.1.0-alpha.44
  - @formspec/runtime@0.1.0-alpha.44

## 0.1.0-alpha.43

### Patch Changes

- [#263](https://github.com/mike-north/formspec/pull/263) [`4a1d3fb`](https://github.com/mike-north/formspec/commit/4a1d3fb26e7d337c69c303b8368c962937360745) Thanks [@mike-north](https://github.com/mike-north)! - Add regression coverage for `Ref<T>` discriminator specialization on large object carriers.

- [#268](https://github.com/mike-north/formspec/pull/268) [`da45909`](https://github.com/mike-north/formspec/commit/da459096da0dad2054e54a17ca71785d179dd71e) Thanks [@mike-north](https://github.com/mike-north)! - Add enum member completions for `@displayName` and `@apiName` `:member` target syntax on string literal union fields.

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Fix TYPE_MISMATCH false positive when built-in numeric constraints (`@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`) are applied to custom types that register `builtinConstraintBroadenings`. The validator now consults the extension registry before rejecting constraints on non-numeric types.

- [#262](https://github.com/mike-north/formspec/pull/262) [`6b373d1`](https://github.com/mike-north/formspec/commit/6b373d151f7b72b08fb8a24a3e823c78d3f5c488) Thanks [@mike-north](https://github.com/mike-north)! - Prevent tag-only TSDoc comments from leaking into emitted schema descriptions.

- [#269](https://github.com/mike-north/formspec/pull/269) [`1f87c94`](https://github.com/mike-north/formspec/commit/1f87c94bdc8be790c3e129d45762577eb73a71f6) Thanks [@mike-north](https://github.com/mike-north)! - Consolidate comment parsers on a unified TSDoc-based parser in @formspec/analysis. ESLint scanner and build package delegate to the unified parser instead of maintaining independent tag detection.

- [#266](https://github.com/mike-north/formspec/pull/266) [`82604ff`](https://github.com/mike-north/formspec/commit/82604ff886368570a2a0f7ee752ed140418b1932) Thanks [@mike-north](https://github.com/mike-north)! - Exclude `__`-prefixed phantom properties from schema emission, preventing OOM when resolving types like `Ref<Customer>` with large circular type graphs. Add `no-double-underscore-fields` ESLint rule to warn authors about excluded properties.

- [#267](https://github.com/mike-north/formspec/pull/267) [`32acd0b`](https://github.com/mike-north/formspec/commit/32acd0bd686bbdbfc6b05dea2a968406dd4081b9) Thanks [@mike-north](https://github.com/mike-north)! - Register all formspec annotation, structure, and ecosystem tags with both tsdoc.json and the programmatic TSDoc parser so mid-prose tag mentions are parsed correctly.

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Introduce unified `FormSpecConfig` system. Rename `@formspec/constraints` to `@formspec/config`. All consumers (build, CLI, ESLint, language server) now accept a `FormSpecConfig` object carrying extensions, constraints, metadata, vendor prefix, and enum serialization. Adds `defineFormSpecConfig` identity function, `loadFormSpecConfig` with jiti-based TypeScript config file loading, `resolveConfigForFile` for monorepo per-package overrides, and `withConfig()` factory on the ESLint plugin. Removes the outdated playground package. See docs/007-configuration.md for the full spec.

- Updated dependencies [[`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f), [`4a1d3fb`](https://github.com/mike-north/formspec/commit/4a1d3fb26e7d337c69c303b8368c962937360745), [`da45909`](https://github.com/mike-north/formspec/commit/da459096da0dad2054e54a17ca71785d179dd71e), [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c), [`6b373d1`](https://github.com/mike-north/formspec/commit/6b373d151f7b72b08fb8a24a3e823c78d3f5c488), [`1f87c94`](https://github.com/mike-north/formspec/commit/1f87c94bdc8be790c3e129d45762577eb73a71f6), [`82604ff`](https://github.com/mike-north/formspec/commit/82604ff886368570a2a0f7ee752ed140418b1932), [`32acd0b`](https://github.com/mike-north/formspec/commit/32acd0bd686bbdbfc6b05dea2a968406dd4081b9), [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c)]:
  - @formspec/build@0.1.0-alpha.43
  - @formspec/dsl@0.1.0-alpha.43
  - @formspec/runtime@0.1.0-alpha.43

## 0.1.0-alpha.42

### Patch Changes

- [#260](https://github.com/mike-north/formspec/pull/260) [`bad8e2c`](https://github.com/mike-north/formspec/commit/bad8e2cf8be66983fac49309cbb381b48418f239) Thanks [@mike-north](https://github.com/mike-north)! - Add `emitsVocabularyKeywords` option to `CustomConstraintRegistration` that allows custom constraints to emit non-vendor-prefixed JSON Schema keywords. This enables extensions to define their own JSON Schema vocabulary (e.g., `decimalMinimum`) instead of being forced to namespace under the vendor prefix.

- Updated dependencies [[`bad8e2c`](https://github.com/mike-north/formspec/commit/bad8e2cf8be66983fac49309cbb381b48418f239)]:
  - @formspec/core@0.1.0-alpha.42
  - @formspec/build@0.1.0-alpha.42
  - @formspec/dsl@0.1.0-alpha.42
  - @formspec/runtime@0.1.0-alpha.42

## 0.1.0-alpha.41

### Minor Changes

- [#258](https://github.com/mike-north/formspec/pull/258) [`62f5e2c`](https://github.com/mike-north/formspec/commit/62f5e2cfb34555a16f7d7cd1e50463f61c0711da) Thanks [@mike-north](https://github.com/mike-north)! - Add configurable enum JSON Schema serialization and enum-member display-name policy support.
  - Default labeled enum output to flat `enum` plus a complete `x-<vendor>-display-names` extension
  - Add opt-in `oneOf` enum serialization with `const`/`title` branches
  - Add `metadata.enumMember.displayName` policy configuration for inferred or required enum-member labels
  - Add `--enum-serialization <enum|oneOf>` to the published CLIs
  - Re-export the new enum-member metadata policy types from `@formspec/core`, `@formspec/dsl`, and `formspec`

### Patch Changes

- Updated dependencies [[`62f5e2c`](https://github.com/mike-north/formspec/commit/62f5e2cfb34555a16f7d7cd1e50463f61c0711da)]:
  - @formspec/core@0.1.0-alpha.41
  - @formspec/build@0.1.0-alpha.41
  - @formspec/dsl@0.1.0-alpha.41
  - @formspec/runtime@0.1.0-alpha.41

## 0.1.0-alpha.40

### Patch Changes

- [#254](https://github.com/mike-north/formspec/pull/254) [`138dbbe`](https://github.com/mike-north/formspec/commit/138dbbe597a93c1c9c565fdb31385ef83f5cdea8) Thanks [@mike-north](https://github.com/mike-north)! - Add `resolveDeclarationMetadata()` to the static build workflow so consumers can resolve method-, field-, and type-level metadata from declarations using FormSpec's active metadata policy. This makes method-level `@apiName` and `@displayName` resolution available alongside existing parameter and return-type schema generation helpers.

- Updated dependencies [[`138dbbe`](https://github.com/mike-north/formspec/commit/138dbbe597a93c1c9c565fdb31385ef83f5cdea8)]:
  - @formspec/build@0.1.0-alpha.40

## 0.1.0-alpha.39

### Patch Changes

- [#250](https://github.com/mike-north/formspec/pull/250) [`857f63d`](https://github.com/mike-north/formspec/commit/857f63d6279c268f540a4fca13dc917f15f90545) Thanks [@mike-north](https://github.com/mike-north)! - Expose resolved type metadata on `DiscoveredTypeSchemas`, add explicit `errorReporting: "throw" | "diagnostics"` overloads on the main static schema generation entry points, and deprecate the older `generateSchemasDetailed()` compatibility wrappers. This also rolls the updated build dependency into the published CLI and umbrella packages.

- Updated dependencies [[`857f63d`](https://github.com/mike-north/formspec/commit/857f63d6279c268f540a4fca13dc917f15f90545), [`857f63d`](https://github.com/mike-north/formspec/commit/857f63d6279c268f540a4fca13dc917f15f90545)]:
  - @formspec/build@0.1.0-alpha.39

## 0.1.0-alpha.38

### Patch Changes

- [#247](https://github.com/mike-north/formspec/pull/247) [`329482b`](https://github.com/mike-north/formspec/commit/329482b3a51685b456050597d4e5c58f5b68d420) Thanks [@aelliott-stripe](https://github.com/aelliott-stripe)! - Fix TS2300 "Duplicate identifier" when a TypeScript global built-in type (e.g. `Date`) is registered as an extension custom type. The synthetic prelude no longer emits `type X = unknown;` for types already declared in TypeScript's lib files, preventing spurious type errors that were misattributed to unrelated tag applications. Unsupported global built-in overrides now surface as a structured `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` diagnostic, and other synthetic setup failures now surface as `SYNTHETIC_SETUP_FAILURE` instead of being collapsed into unrelated tag failures.

- Updated dependencies [[`329482b`](https://github.com/mike-north/formspec/commit/329482b3a51685b456050597d4e5c58f5b68d420)]:
  - @formspec/build@0.1.0-alpha.38

## 0.1.0-alpha.37

### Patch Changes

- [#246](https://github.com/mike-north/formspec/pull/246) [`a12ff31`](https://github.com/mike-north/formspec/commit/a12ff31e5ba0f28398bd409bcaf8b635dd68549c) Thanks [@mike-north](https://github.com/mike-north)! - Expose declaration-level semantic summaries for documented declarations and use them for declaration hover payloads.

- [#241](https://github.com/mike-north/formspec/pull/241) [`66736d9`](https://github.com/mike-north/formspec/commit/66736d98033fd71e22fe29b9fb298cf6d4b9b0a3) Thanks [@mike-north](https://github.com/mike-north)! - Expand static-build API coverage for host-owned programs and awaited return types.

- [#244](https://github.com/mike-north/formspec/pull/244) [`fdfd076`](https://github.com/mike-north/formspec/commit/fdfd07698448ee8895fa42dd9daee4af9a23d775) Thanks [@mike-north](https://github.com/mike-north)! - Support mapped and referenced object-like type aliases through the public schema generation entry points.
  - `@formspec/build` now generates schemas for object-like utility aliases such as `Partial<T>`, `Pick<T, ...>`, and intersections that add inline members.
  - Invalid callable intersections and duplicate-property alias merges continue to be rejected.

- Updated dependencies [[`a12ff31`](https://github.com/mike-north/formspec/commit/a12ff31e5ba0f28398bd409bcaf8b635dd68549c), [`66736d9`](https://github.com/mike-north/formspec/commit/66736d98033fd71e22fe29b9fb298cf6d4b9b0a3), [`fdfd076`](https://github.com/mike-north/formspec/commit/fdfd07698448ee8895fa42dd9daee4af9a23d775)]:
  - @formspec/build@0.1.0-alpha.37

## 0.1.0-alpha.36

### Patch Changes

- [#237](https://github.com/mike-north/formspec/pull/237) [`d0260e3`](https://github.com/mike-north/formspec/commit/d0260e3ff692a4e363f14d6c71a61992f31bbafd) Thanks [@mike-north](https://github.com/mike-north)! - Fix discriminator specialization for imported generic type aliases that carry
  `@discriminator` across module boundaries.
  - `@formspec/build` now resolves imported type aliases through TypeScript import
    alias symbols before unwrapping object-like alias bodies, so imported
    `Ref<T>`-style aliases specialize the same way as local aliases.
  - Added regression coverage for local vs imported generic aliases with matching
    discriminator behavior, including metadata-derived fallback and
    `discriminator.apiNamePrefix`.

- Updated dependencies [[`d0260e3`](https://github.com/mike-north/formspec/commit/d0260e3ff692a4e363f14d6c71a61992f31bbafd)]:
  - @formspec/build@0.1.0-alpha.36

## 0.1.0-alpha.35

### Patch Changes

- [#234](https://github.com/mike-north/formspec/pull/234) [`6945d19`](https://github.com/mike-north/formspec/commit/6945d19caff5fbd7b3aa0ffb074ae22ca6b03c5d) Thanks [@mike-north](https://github.com/mike-north)! - Fix a stack overflow in discriminator specialization when a generic object-like alias
  uses a same-file conditional helper alias for the discriminator field and the bound
  type falls back to metadata-derived discriminator values.
  - `@formspec/build` now guards primitive alias unwrapping for same-file conditional
    helper aliases so metadata-backed discriminator specialization no longer recurses
    indefinitely.
  - Added regression coverage for same-file local helper aliases, same-file inline
    conditional discriminator fields, and the existing cross-file imported-helper
    contrast case.

- Updated dependencies [[`6945d19`](https://github.com/mike-north/formspec/commit/6945d19caff5fbd7b3aa0ffb074ae22ca6b03c5d)]:
  - @formspec/build@0.1.0-alpha.35

## 0.1.0-alpha.34

### Patch Changes

- [#231](https://github.com/mike-north/formspec/pull/231) [`b0137b8`](https://github.com/mike-north/formspec/commit/b0137b807af13890d53fdafcfe849328deb11cb4) Thanks [@mike-north](https://github.com/mike-north)! - Finish `@discriminator` specialization for generic object aliases.
  - `@formspec/build` now supports discriminator specialization for object-like generic type aliases expressed as type literals, parenthesized type literals, intersections, and parenthesized intersections.
  - Discriminator resolution now prefers concrete literal identities exposed on bound types (for example `readonly object: "customer"`) before falling back to resolved metadata, and supports discriminator-only `apiNamePrefix` application for metadata-derived values.
  - `@formspec/eslint-plugin` now accepts discriminator target fields whose types become string-like through generic constraints or base constraints, including object-like type alias intersections.

- Updated dependencies [[`b0137b8`](https://github.com/mike-north/formspec/commit/b0137b807af13890d53fdafcfe849328deb11cb4)]:
  - @formspec/build@0.1.0-alpha.34

## 0.1.0-alpha.33

### Patch Changes

- [#229](https://github.com/mike-north/formspec/pull/229) [`f1a3644`](https://github.com/mike-north/formspec/commit/f1a364466c124dd326d7705732c04682f53c7455) Thanks [@aelliott-stripe](https://github.com/aelliott-stripe)! - Fix schema generation when a host interface references an extension-registered custom type: the synthetic program now emits `type X = unknown;` declarations for extension types, so constraint tag validation no longer filters out declarations that reference those types.

- [#221](https://github.com/mike-north/formspec/pull/221) [`d0fc748`](https://github.com/mike-north/formspec/commit/d0fc748c7995c2458df069d04261f38cf2b3abcb) Thanks [@mike-north](https://github.com/mike-north)! - Stop summary-derived JSON Schema descriptions at recognized metadata tags such as `@apiName` so consumed TSDoc metadata does not leak into emitted descriptions.

- [#228](https://github.com/mike-north/formspec/pull/228) [`abdbcb1`](https://github.com/mike-north/formspec/commit/abdbcb1a001bde9412f3988e42b132a68baa5cbe) Thanks [@mike-north](https://github.com/mike-north)! - Add explicit metadata source mappings to the shared analysis helpers and fix build metadata resolution edge cases around logical-name inference and extension slot qualifier handling.

- [#227](https://github.com/mike-north/formspec/pull/227) [`63d3b65`](https://github.com/mike-north/formspec/commit/63d3b652c39e39ea8a6c4385fef5f6ac88e7529a) Thanks [@mike-north](https://github.com/mike-north)! - Add shared metadata analysis helpers for existing TypeScript programs, use them in build metadata resolution, and re-export them for downstream ESLint rule authors.

- [#226](https://github.com/mike-north/formspec/pull/226) [`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata slot registration types and validation plumbing so extensions can define tooling-facing metadata tags and analysis slots across the core/build/analysis stack.

- Updated dependencies [[`f1a3644`](https://github.com/mike-north/formspec/commit/f1a364466c124dd326d7705732c04682f53c7455), [`d0fc748`](https://github.com/mike-north/formspec/commit/d0fc748c7995c2458df069d04261f38cf2b3abcb), [`abdbcb1`](https://github.com/mike-north/formspec/commit/abdbcb1a001bde9412f3988e42b132a68baa5cbe), [`63d3b65`](https://github.com/mike-north/formspec/commit/63d3b652c39e39ea8a6c4385fef5f6ac88e7529a), [`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3)]:
  - @formspec/build@0.1.0-alpha.33
  - @formspec/core@0.1.0-alpha.33
  - @formspec/dsl@0.1.0-alpha.33
  - @formspec/runtime@0.1.0-alpha.33

## 0.1.0-alpha.32

### Patch Changes

- [#218](https://github.com/mike-north/formspec/pull/218) [`d22aa48`](https://github.com/mike-north/formspec/commit/d22aa483d33735d20d793430d920c0503f56c1a6) Thanks [@mike-north](https://github.com/mike-north)! - Add a supported static build context API for compiler-backed export discovery,
  and support generating schemas from resolved declarations, method parameters,
  method return types, and other discovered TypeScript types without importing
  `@formspec/build/internals`.
- Updated dependencies [[`d22aa48`](https://github.com/mike-north/formspec/commit/d22aa483d33735d20d793430d920c0503f56c1a6)]:
  - @formspec/build@0.1.0-alpha.32

## 0.1.0-alpha.31

### Patch Changes

- [#214](https://github.com/mike-north/formspec/pull/214) [`9c6173c`](https://github.com/mike-north/formspec/commit/9c6173c342a5f912a1ccbc7f4431902e0463c35f) Thanks [@mike-north](https://github.com/mike-north)! - Honor resolved `apiName` metadata consistently throughout generated JSON Schema output.

- Updated dependencies [[`9c6173c`](https://github.com/mike-north/formspec/commit/9c6173c342a5f912a1ccbc7f4431902e0463c35f)]:
  - @formspec/build@0.1.0-alpha.31

## 0.1.0-alpha.30

### Patch Changes

- [#209](https://github.com/mike-north/formspec/pull/209) [`10b1207`](https://github.com/mike-north/formspec/commit/10b120714b5e820222fd0b5f0f6f40010977faaa) Thanks [@mike-north](https://github.com/mike-north)! - Document and harden discriminator tooling coverage across analysis and editor integrations.

- Updated dependencies [[`10b1207`](https://github.com/mike-north/formspec/commit/10b120714b5e820222fd0b5f0f6f40010977faaa)]:
  - @formspec/build@0.1.0-alpha.30

## 0.1.0-alpha.29

### Minor Changes

- [#206](https://github.com/mike-north/formspec/pull/206) [`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata policy and resolved metadata support across core, the DSL factory surface, and build generation. JSON Schema and UI Schema now honor resolved `apiName` and `displayName`, mixed-authoring merges metadata by explicit-vs-inferred precedence, and discriminator resolution supports literal identity properties plus metadata-driven names for object-like generic sources.

### Patch Changes

- Updated dependencies [[`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20)]:
  - @formspec/core@0.1.0-alpha.29
  - @formspec/dsl@0.1.0-alpha.29
  - @formspec/build@0.1.0-alpha.29
  - @formspec/runtime@0.1.0-alpha.29

## 0.1.0-alpha.28

### Minor Changes

- [#202](https://github.com/mike-north/formspec/pull/202) [`c8b1358`](https://github.com/mike-north/formspec/commit/c8b1358976b24e30e0d6a588dbcd84a80a106094) Thanks [@mike-north](https://github.com/mike-north)! - Add built-in `@discriminator :fieldName T` support for generic object declarations.
  - `@formspec/build` now preserves generic reference type arguments and specializes discriminator fields to singleton string enums in emitted JSON Schema.
  - `@formspec/analysis`, `@formspec/ts-plugin`, and `@formspec/language-server` now recognize `@discriminator`, provide hover/completion support, and suggest local type parameter names in argument position.
  - `@formspec/eslint-plugin` now validates declaration-level discriminator usage, including duplicate tags, direct-property targeting, local type-parameter operands, and target-field shape checks.

### Patch Changes

- [#199](https://github.com/mike-north/formspec/pull/199) [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf) Thanks [@mike-north](https://github.com/mike-north)! - Declare MIT licensing across package metadata and README documentation.

- Updated dependencies [[`c8b1358`](https://github.com/mike-north/formspec/commit/c8b1358976b24e30e0d6a588dbcd84a80a106094), [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf)]:
  - @formspec/build@0.1.0-alpha.28
  - @formspec/core@0.1.0-alpha.28
  - @formspec/dsl@0.1.0-alpha.28
  - @formspec/runtime@0.1.0-alpha.28

## 0.1.0-alpha.27

### Minor Changes

- [#192](https://github.com/mike-north/formspec/pull/192) [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c) Thanks [@mike-north](https://github.com/mike-north)! - Prune public API surface and promote Zod validation schemas

  Move extension authoring types, mixed authoring generator, and implementation-detail types from `@public` to `@internal`. Promote `jsonSchema7Schema`, `uiSchemaSchema`, and the JSON Schema 7 type family to `@public` on the main `@formspec/build` entry point.

### Patch Changes

- [#196](https://github.com/mike-north/formspec/pull/196) [`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd) Thanks [@mike-north](https://github.com/mike-north)! - Tighten API Extractor surface enforcement by promoting forgotten exports to errors and cleaning up leaked public types across analysis, ts-plugin, eslint-plugin, and formspec.

- [#195](https://github.com/mike-north/formspec/pull/195) [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827) Thanks [@mike-north](https://github.com/mike-north)! - Tighten exported API surfaces so the published declarations, API Extractor rollups, and generated docs stay aligned.

  This promotes a small set of already-exposed types to supported public exports, replaces a few leaked internal type references with public ones, and keeps the root workspace lint from traversing nested agent worktrees.

- [#194](https://github.com/mike-north/formspec/pull/194) [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030) Thanks [@mike-north](https://github.com/mike-north)! - Repair the public tooling entrypoints after the API rollup refactor and add program-backed schema generation in `@formspec/build`.

- Updated dependencies [[`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd), [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c), [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827), [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030)]:
  - @formspec/build@0.1.0-alpha.27
  - @formspec/core@0.1.0-alpha.27
  - @formspec/dsl@0.1.0-alpha.27
  - @formspec/runtime@0.1.0-alpha.27

## 0.1.0-alpha.26

### Patch Changes

- [#189](https://github.com/mike-north/formspec/pull/189) [`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53) Thanks [@mike-north](https://github.com/mike-north)! - Document previously undocumented exported APIs and enforce API Extractor's
  `ae-undocumented` validation for published package surfaces.
  - Add contributor-facing docs for internal exports and external-facing docs for
    alpha-or-better public APIs.
  - Enable `ae-undocumented` so newly exported APIs must carry TSDoc before they
    can be released.

- Updated dependencies [[`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53)]:
  - @formspec/build@0.1.0-alpha.26
  - @formspec/core@0.1.0-alpha.26
  - @formspec/dsl@0.1.0-alpha.26
  - @formspec/runtime@0.1.0-alpha.26

## 0.1.0-alpha.24

### Patch Changes

- [#183](https://github.com/mike-north/formspec/pull/183) [`6815fec`](https://github.com/mike-north/formspec/commit/6815fec2ff1bc925b5e3fdf71b515ef3239bb58c) Thanks [@mike-north](https://github.com/mike-north)! - Preserve markdown formatting from TSDoc summary, remarks, and deprecated text in emitted schema descriptions and vendor extensions.

- Updated dependencies [[`6815fec`](https://github.com/mike-north/formspec/commit/6815fec2ff1bc925b5e3fdf71b515ef3239bb58c)]:
  - @formspec/build@0.1.0-alpha.24

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
  - @formspec/build@0.1.0-alpha.23
  - @formspec/core@0.1.0-alpha.23
  - @formspec/dsl@0.1.0-alpha.23
  - @formspec/runtime@0.1.0-alpha.23

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
  - @formspec/build@0.1.0-alpha.22

## 0.1.0-alpha.21

### Patch Changes

- [#172](https://github.com/mike-north/formspec/pull/172) [`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c) Thanks [@mike-north](https://github.com/mike-north)! - Remove @description tag; use TSDoc summary text for JSON Schema description and @remarks for x-vendor-remarks extension keyword

- Updated dependencies [[`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c)]:
  - @formspec/core@0.1.0-alpha.21
  - @formspec/build@0.1.0-alpha.21
  - @formspec/dsl@0.1.0-alpha.21
  - @formspec/runtime@0.1.0-alpha.21

## 0.1.0-alpha.20

### Patch Changes

- [#163](https://github.com/mike-north/formspec/pull/163) [`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34) Thanks [@mike-north](https://github.com/mike-north)! - Add semantic comment cursor analysis for FormSpec tags, including richer hover
  content and target-specifier completions for language-server consumers.

- [#165](https://github.com/mike-north/formspec/pull/165) [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d) Thanks [@mike-north](https://github.com/mike-north)! - Integrate compiler-backed comment tag validation into shared analysis and build extraction.

- [#164](https://github.com/mike-north/formspec/pull/164) [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef) Thanks [@mike-north](https://github.com/mike-north)! - Add compiler-backed synthetic tag signature scaffolding for shared FormSpec comment analysis.

- [#161](https://github.com/mike-north/formspec/pull/161) [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95) Thanks [@mike-north](https://github.com/mike-north)! - Centralize FormSpec comment tag analysis and fix shared registry regressions across build, lint, and language-server tooling.

- Updated dependencies [[`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34), [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d), [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef), [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95)]:
  - @formspec/build@0.1.0-alpha.20

## 0.1.0-alpha.19

### Patch Changes

- [#155](https://github.com/mike-north/formspec/pull/155) [`1df7e34`](https://github.com/mike-north/formspec/commit/1df7e343b4fc17746c9a624ac5339db0071bc187) Thanks [@mike-north](https://github.com/mike-north)! - Release the unpublished follow-up fixes from the spec-parity work.
  - `@formspec/build`: restore generation-time IR validation, respect vendor-prefixed deprecation metadata, keep custom constraint validation working for nullable and array-backed extension types, and align description extraction with the documented `@description` > `@remarks` > summary-text precedence.
  - `@formspec/cli`: pick up the updated build pipeline behavior through the published CLI entrypoint.
  - `@formspec/core`: include the extension and constraint-definition fixes required by the updated build pipeline.
  - `@formspec/eslint-plugin`: fix boolean tag handling so `@uniqueItems` does not require an argument and still participates in type checking, expose plugin metadata consistently for ESLint/doc tooling, and keep generated rule docs in sync with the supported public exports.
  - `formspec`: pick up the updated build and ESLint-plugin behavior through the umbrella package surface.

- Updated dependencies [[`1df7e34`](https://github.com/mike-north/formspec/commit/1df7e343b4fc17746c9a624ac5339db0071bc187)]:
  - @formspec/build@0.1.0-alpha.19
  - @formspec/core@0.1.0-alpha.19
  - @formspec/dsl@0.1.0-alpha.19
  - @formspec/runtime@0.1.0-alpha.19

## 0.1.0-alpha.17

### Patch Changes

- Updated dependencies [[`dbc6c21`](https://github.com/mike-north/formspec/commit/dbc6c219be95d9481afa9936eb3b81c7f446fb65)]:
  - @formspec/build@0.1.0-alpha.17
  - @formspec/core@0.1.0-alpha.17
  - @formspec/dsl@0.1.0-alpha.17
  - @formspec/runtime@0.1.0-alpha.17

## 0.1.0-alpha.16

### Minor Changes

- [#133](https://github.com/mike-north/formspec/pull/133) [`271071e`](https://github.com/mike-north/formspec/commit/271071ed46833db97a81407557ad5c52e697b8b0) Thanks [@mike-north](https://github.com/mike-north)! - Add a mixed-authoring composition API for composing TSDoc-derived models with ChainDSL field overlays.

  The new `buildMixedAuthoringSchemas()` entry point keeps the static model authoritative while layering in runtime field metadata such as dynamic option sources.

  This also fixes mixed-authoring composition bugs that previously allowed incompatible overlays to silently replace static field types or accept unsupported nested object/array overlays instead of failing loudly.

### Patch Changes

- Updated dependencies [[`d7f10fe`](https://github.com/mike-north/formspec/commit/d7f10fe7d3d855a99423baec3996bebd47f80190), [`2acf352`](https://github.com/mike-north/formspec/commit/2acf3529a93ad70801073503c13e505ccef8a23b), [`889470b`](https://github.com/mike-north/formspec/commit/889470b4b3ab9d4bf9ed72169e083a2887256f57), [`271071e`](https://github.com/mike-north/formspec/commit/271071ed46833db97a81407557ad5c52e697b8b0), [`111c021`](https://github.com/mike-north/formspec/commit/111c021c13a4468a57d0c2291ff3aa77133117a0), [`6276145`](https://github.com/mike-north/formspec/commit/6276145056bf1510b9ea785a22e1503ec2a658f7)]:
  - @formspec/core@0.1.0-alpha.16
  - @formspec/build@0.1.0-alpha.16
  - @formspec/dsl@0.1.0-alpha.16
  - @formspec/runtime@0.1.0-alpha.16

## 0.1.0-alpha.15

### Patch Changes

- Updated dependencies [[`e72c621`](https://github.com/mike-north/formspec/commit/e72c621781af2f71e1b51b168f1f6c9dc7b40195), [`568f7e5`](https://github.com/mike-north/formspec/commit/568f7e5db40d2606ecbf0e535212e0f0973c5036), [`ac69f33`](https://github.com/mike-north/formspec/commit/ac69f3376f1d5b8193b79a20d023b13e5ca82a8c), [`0526742`](https://github.com/mike-north/formspec/commit/0526742817ef372e968b582d579bc79fdf9f17aa), [`3cf95b1`](https://github.com/mike-north/formspec/commit/3cf95b120cbf04a1f443f1b825682383f7da6d14), [`6b0930e`](https://github.com/mike-north/formspec/commit/6b0930ee43131c10d48222ccdd687746a252b505), [`5752b5c`](https://github.com/mike-north/formspec/commit/5752b5c3d77f0cd1a2183a0794ce5889702cb9f2)]:
  - @formspec/build@0.1.0-alpha.15

## 0.1.0-alpha.14

### Patch Changes

- Updated dependencies [[`ed89d72`](https://github.com/mike-north/formspec/commit/ed89d72863ad475e811d0d9c0c406816d65fda6d), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec)]:
  - @formspec/build@0.1.0-alpha.14
  - @formspec/core@0.1.0-alpha.14
  - @formspec/dsl@0.1.0-alpha.14
  - @formspec/runtime@0.1.0-alpha.14

## 0.1.0-alpha.13

### Minor Changes

- [#69](https://github.com/mike-north/formspec/pull/69) [`bc76a57`](https://github.com/mike-north/formspec/commit/bc76a57ffe1934c485aec0c9e1143cc5203c429c) Thanks [@mike-north](https://github.com/mike-north)! - Add type guards for FormElement subtypes and string/number field constraints
  - Export 11 type guard functions (isTextField, isNumberField, etc.) from @formspec/core
  - Add minLength, maxLength, pattern to TextField; multipleOf to NumberField; params to DynamicSchemaField
  - Wire new constraints through chain DSL canonicalizer to FormIR
  - Re-export type guards from formspec umbrella package

### Patch Changes

- Updated dependencies [[`bc76a57`](https://github.com/mike-north/formspec/commit/bc76a57ffe1934c485aec0c9e1143cc5203c429c)]:
  - @formspec/core@0.1.0-alpha.13
  - @formspec/build@0.1.0-alpha.13
  - @formspec/dsl@0.1.0-alpha.13
  - @formspec/runtime@0.1.0-alpha.13

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
  - @formspec/build@0.1.0-alpha.12
  - @formspec/runtime@0.1.0-alpha.12
  - @formspec/dsl@0.1.0-alpha.12

## 0.1.0-alpha.11

### Minor Changes

- [#47](https://github.com/mike-north/formspec/pull/47) [`9143266`](https://github.com/mike-north/formspec/commit/9143266fa69ff4bd8f6232c997ce7d2d070bef4e) Thanks [@mike-north](https://github.com/mike-north)! - Unify UI Schema output: both chain DSL and decorator DSL now produce JSON Forms-compliant UI Schema, validated at generation time via Zod schemas.

  **Breaking:** `ClassSchemas.uiSchema` and `GenerateFromClassResult.uiSchema` changed from `{ elements: FormSpecField[] }` to `UISchema` (a JSON Forms VerticalLayout with Controls, Groups, and rules). Consumers accessing `.uiSchema.elements[n]._field` or `.uiSchema.elements[n].id` must update to use the JSON Forms structure (`.uiSchema.elements[n].scope`, `.uiSchema.elements[n].type`).

  New exports: `generateUiSchemaFromFields()`, Zod validation schemas (`uiSchemaSchema`, `jsonSchema7Schema`, `controlSchema`, `ruleSchema`, etc.), and types (`Categorization`, `Category`, `LabelElement`).

### Patch Changes

- [#49](https://github.com/mike-north/formspec/pull/49) [`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b) Thanks [@mike-north](https://github.com/mike-north)! - Add dual CJS/ESM builds via tsup and API Extractor for all published packages

  All published packages now ship both ESM (.js) and CJS (.cjs) output, built by tsup. API Extractor generates rolled-up .d.ts declaration files for all 9 packages (previously missing for @formspec/decorators and @formspec/cli).

- Updated dependencies [[`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b), [`9143266`](https://github.com/mike-north/formspec/commit/9143266fa69ff4bd8f6232c997ce7d2d070bef4e)]:
  - @formspec/core@0.1.0-alpha.11
  - @formspec/dsl@0.1.0-alpha.11
  - @formspec/build@0.1.0-alpha.11
  - @formspec/runtime@0.1.0-alpha.11

## 0.1.0-alpha.10

### Minor Changes

- [#41](https://github.com/mike-north/formspec/pull/41) [`15519c3`](https://github.com/mike-north/formspec/commit/15519c393904ed73748f3de8dd1a07b28cfdcf41) Thanks [@mike-north](https://github.com/mike-north)! - Add interface and type alias schema generation with TSDoc tags

  **@formspec/build:**
  - New `generateSchemas()` unified entry point — auto-detects class, interface, or type alias
  - Interface analysis: `@displayName`, `@description`, and constraint tags (`@Minimum`, `@Pattern`, etc.) extracted from TSDoc comments on interface properties
  - Type alias analysis: object type literal aliases analyzed the same as interfaces
  - Constrained primitive type aliases: `type Percent = number` with `@Minimum 0 @Maximum 100` propagates constraints to fields using that type
  - `@EnumOptions` TSDoc tag with inline JSON: `@EnumOptions ["a","b","c"]`
  - Nested constraint propagation works across classes, interfaces, and type aliases
  - `analyzeTypeAlias()` returns error results with line numbers instead of throwing
  - Generic `findNodeByName<T>` helper consolidates finder functions

  **@formspec/core:**
  - Added `EnumOptions: "json"` to `CONSTRAINT_TAG_DEFINITIONS`

### Patch Changes

- Updated dependencies [[`15519c3`](https://github.com/mike-north/formspec/commit/15519c393904ed73748f3de8dd1a07b28cfdcf41)]:
  - @formspec/build@0.1.0-alpha.10
  - @formspec/core@0.1.0-alpha.10
  - @formspec/dsl@0.1.0-alpha.10
  - @formspec/runtime@0.1.0-alpha.10

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
  - @formspec/build@0.1.0-alpha.9
  - @formspec/dsl@0.1.0-alpha.9
  - @formspec/runtime@0.1.0-alpha.9

## 0.1.0-alpha.8

### Patch Changes

- Updated dependencies [[`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98)]:
  - @formspec/build@0.1.0-alpha.8
  - @formspec/dsl@0.1.0-alpha.8
  - @formspec/runtime@0.1.0-alpha.8

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [[`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f)]:
  - @formspec/build@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- Updated dependencies [[`7b3d95d`](https://github.com/mike-north/formspec/commit/7b3d95d9b51664f7156bc753cfcd64d3bd3bda22)]:
  - @formspec/dsl@0.1.0-alpha.6
  - @formspec/build@0.1.0-alpha.5
  - @formspec/runtime@0.1.0-alpha.4

## 0.1.0-alpha.5

### Patch Changes

- Updated dependencies [[`a4b341d`](https://github.com/mike-north/formspec/commit/a4b341d42adaacf6f7e8fa79139575a41b181e84)]:
  - @formspec/dsl@0.1.0-alpha.5
  - @formspec/build@0.1.0-alpha.5
  - @formspec/runtime@0.1.0-alpha.4

## 0.1.0-alpha.4

### Patch Changes

- [#18](https://github.com/mike-north/formspec/pull/18) [`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b) Thanks [@mike-north](https://github.com/mike-north)! - Add README.md documentation to all npm packages
  - Added comprehensive README.md files to formspec, @formspec/core, @formspec/build, and @formspec/runtime
  - Added ESM requirements section to all package READMEs
  - Updated package.json files to include README.md in published packages

  This addresses DX evaluation feedback that published packages lacked documentation,
  making it difficult for new users to get started.

- [#17](https://github.com/mike-north/formspec/pull/17) [`96f08ac`](https://github.com/mike-north/formspec/commit/96f08acc744ca1de8f8ca58be15e51844aba29e9) Thanks [@mike-north](https://github.com/mike-north)! - Fix TypeScript type resolution by including API Extractor in build

  Previously, the `types` field in package.json pointed to rolled-up declaration
  files (e.g., `./dist/dsl.d.ts`), but these files were not being generated
  during the build because API Extractor was not included in the build script.

  This caused TypeScript users to see:

  ```
  error TS2307: Cannot find module '@formspec/dsl' or its corresponding type declarations.
  ```

  The fix adds `api-extractor run --local` to the build scripts for all affected
  packages, ensuring the declaration rollup files are generated during every build.

- Updated dependencies [[`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b), [`96f08ac`](https://github.com/mike-north/formspec/commit/96f08acc744ca1de8f8ca58be15e51844aba29e9)]:
  - @formspec/core@0.1.0-alpha.4
  - @formspec/build@0.1.0-alpha.4
  - @formspec/runtime@0.1.0-alpha.4
  - @formspec/dsl@0.1.0-alpha.4

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [[`b42319d`](https://github.com/mike-north/formspec/commit/b42319dce2f0652a9f6e6d46ae1f411b71c1b2d7)]:
  - @formspec/core@0.1.0-alpha.2
  - @formspec/dsl@0.1.0-alpha.2
  - @formspec/build@0.1.0-alpha.2
  - @formspec/runtime@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- [#3](https://github.com/mike-north/formspec/pull/3) [`3e86b0f`](https://github.com/mike-north/formspec/commit/3e86b0fe4f05860bfc20ed9cf4662dd44f99beb3) Thanks [@mike-north](https://github.com/mike-north)! - Add build integration tools for schema generation

  New `writeSchemas()` function and CLI tool make it easy to generate JSON Schema and UI Schema files as part of your build process.

  ### New exports

  **Functions:**
  - `writeSchemas(form, options)` - Build and write schemas to disk

  **Types:**
  - `WriteSchemasOptions` - Configuration for schema file output
  - `WriteSchemasResult` - Paths to generated schema files

  **CLI:**
  - `formspec-build` command for generating schemas from form definition files

  ### Documentation improvements
  - Removed unnecessary `as const` from all `field.enum()` examples
  - Updated JSDoc to clarify that `field.enum()` automatically preserves literal types
  - Added comprehensive "Build Integration" section to README

### Patch Changes

- Updated dependencies [[`3e86b0f`](https://github.com/mike-north/formspec/commit/3e86b0fe4f05860bfc20ed9cf4662dd44f99beb3)]:
  - @formspec/build@0.1.0-alpha.1

## 0.1.0-alpha.0

### Minor Changes

- [#1](https://github.com/mike-north/formspec/pull/1) [`7a42311`](https://github.com/mike-north/formspec/commit/7a423116ca507f9a52dda94ba1238bf7bdb2b949) Thanks [@mike-north](https://github.com/mike-north)! - Add `is()` predicate helper and update `when()` API for better readability

  The `when()` function now accepts a predicate created with `is()` instead of separate field/value arguments:

  ```typescript
  // Before (confusing):
  when("paymentMethod", "card", ...)

  // After (clear):
  when(is("paymentMethod", "card"), ...)
  ```

  This makes the conditional logic much more readable and self-documenting.

  ### New exports
  - `is(fieldName, value)` - Creates an equality predicate
  - `EqualsPredicate` type - Type for equality predicates
  - `Predicate` type - Union of all predicate types

  ### Breaking changes

  The `when()` function signature has changed from `when(fieldName, value, ...elements)` to `when(predicate, ...elements)`. Update all usages to use the `is()` helper.

### Patch Changes

- Updated dependencies [[`7a42311`](https://github.com/mike-north/formspec/commit/7a423116ca507f9a52dda94ba1238bf7bdb2b949)]:
  - @formspec/core@0.1.0-alpha.0
  - @formspec/dsl@0.1.0-alpha.0
  - @formspec/build@0.1.0-alpha.0
  - @formspec/runtime@0.1.0-alpha.0
