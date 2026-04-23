# @formspec/constraints

## 0.1.0-alpha.63

### Patch Changes

- [#410](https://github.com/mike-north/formspec/pull/410) [`2f430b6`](https://github.com/mike-north/formspec/commit/2f430b60f55c600b3e18a91a54f637feb56b9a55) Thanks [@mike-north](https://github.com/mike-north)! - Internal restructure: tests moved from `src/__tests__/` to a sibling `tests/` folder in each package, with the TypeScript typecheck scope widened to cover them. No public API changes.

- Updated dependencies [[`2f430b6`](https://github.com/mike-north/formspec/commit/2f430b60f55c600b3e18a91a54f637feb56b9a55)]:
  - @formspec/core@0.1.0-alpha.63

## 0.1.0-alpha.60

### Patch Changes

- [#404](https://github.com/mike-north/formspec/pull/404) [`f0929c6`](https://github.com/mike-north/formspec/commit/f0929c60e7f74db7da6cffd589a8daaa5ba1e834) Thanks [@mike-north](https://github.com/mike-north)! - Tighten external-dependency minimums so every package advertises the version it's actually built against, and align internal devDependencies across the workspace.

  Consumer-visible:
  - `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised from `^5.0.0` to `^5.7.3`.
  - `@formspec/cli`: `typescript` runtime dependency raised from `^5.0.0` to `^5.7.3`.
  - `@formspec/eslint-plugin`: `eslint` peer dependency raised from `^9.0.0` to `^9.39.2`.

  Internal only (devDependencies): `vitest` aligned to `^3.2.4` across all packages; `@microsoft/api-extractor` upgraded to `^7.58.7` (latest 7.x, now bundling TypeScript 5.9.3).

  Consumers already on TypeScript 5.7+ and ESLint 9.39+ are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade.

- [#405](https://github.com/mike-north/formspec/pull/405) [`d70c0b0`](https://github.com/mike-north/formspec/commit/d70c0b0414eb1630b5593ebe0a22a9e3dc3c2d0a) Thanks [@mike-north](https://github.com/mike-north)! - Raise the `typescript` minimum from `^5.7.3` to `^5.9.3` for the workspace packages that declare a `typescript` peer or runtime dependency, so those packages advertise TypeScript 5.9 as their supported baseline. The other packages listed in this changeset receive a patch bump because they are part of the repo's linked version group.

  Consumer-visible:
  - `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised to `^5.9.3`.
  - `@formspec/cli`: `typescript` runtime dependency raised to `^5.9.3`.
  - `@formspec/config`, `@formspec/dsl`, `@formspec/language-server`, `@formspec/runtime`, `@formspec/validator`, and `formspec`: patch bumps only, with no direct `typescript` dependency range change in this changeset.

  Consumers already on TypeScript 5.9 are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade where applicable.

## 0.1.0-alpha.59

### Patch Changes

- [#359](https://github.com/mike-north/formspec/pull/359) [`90434b6`](https://github.com/mike-north/formspec/commit/90434b64a631ba4c909d9f9a0455d10ffdb8d34d) Thanks [@mike-north](https://github.com/mike-north)! - Fix `@defaultValue` on custom-type fields emitting a value whose runtime type does not conform to the field's JSON Schema type.

  For example, `@defaultValue 9.99` on a `Decimal` field (which maps to `{ type: "string" }`) previously produced `{ "default": 9.99 }` — a numeric default on a string-typed schema. The build pipeline now coerces the parsed literal through the custom-type registration before emitting it as the JSON Schema `default` keyword.

  Coercion strategy (in priority order):
  1. **Explicit hook**: if the `CustomTypeRegistration` provides a `serializeDefault` function, it is called with the parsed literal and the type payload. Extensions needing bespoke serialization (e.g., Date → ISO-8601 string) should use this hook.
  2. **Inference fallback**: when no `serializeDefault` hook is present, the pipeline inspects the `type` keyword returned by `toJsonSchema`. If the emitted type is `"string"` and the parsed literal is a `number`, `boolean`, or `bigint`, it is coerced to a string. Other literal shapes (including objects and arrays) are left unchanged unless an explicit `serializeDefault` hook handles them.
  3. **Pass-through**: non-custom types are unaffected; custom types without a matching registration are also passed through unchanged, as are custom-type literals not covered by the inference fallback.

- [#369](https://github.com/mike-north/formspec/pull/369) [`abc56dc`](https://github.com/mike-north/formspec/commit/abc56dc390f280cfef9ee72eaf2c3e9683065ccb) Thanks [@mike-north](https://github.com/mike-north)! - Fix type-level `@format` inheritance on derived interfaces and classes (issue #367). When an interface or class extends a base that declares a type-level `@format`, the derived type's `$defs` entry now carries the inherited `format` keyword. Explicit `@format` on the derived type continues to win over the inherited value.

- [#356](https://github.com/mike-north/formspec/pull/356) [`4716b37`](https://github.com/mike-north/formspec/commit/4716b37494f56c7d110cae6c3ef9ab4a130d45da) Thanks [@mike-north](https://github.com/mike-north)! - Fix `enumSerialization` handling after the smart-size release by validating malformed per-package overrides in `formspec.config.*` files and by making the CLI honor package-scoped `enumSerialization` overrides when generating schemas. `@formspec/build` no longer constructs an empty extension registry when a caller passes a config with `extensions: []`, so a resolved config can be handed to schema generation without paying for registry setup that was never configured.

- Updated dependencies [[`90434b6`](https://github.com/mike-north/formspec/commit/90434b64a631ba4c909d9f9a0455d10ffdb8d34d), [`abc56dc`](https://github.com/mike-north/formspec/commit/abc56dc390f280cfef9ee72eaf2c3e9683065ccb)]:
  - @formspec/core@0.1.0-alpha.59

## 0.1.0-alpha.56

### Patch Changes

- [#343](https://github.com/mike-north/formspec/pull/343) [`6081427`](https://github.com/mike-north/formspec/commit/60814270e6f6a0e24258590020129f907f4b89f9) Thanks [@mike-north](https://github.com/mike-north)! - Add `enumSerialization: "smart-size"` for compact enum output that preserves distinct labels only when needed.

## 0.1.0-alpha.55

### Minor Changes

- [#313](https://github.com/mike-north/formspec/pull/313) [`a59effe`](https://github.com/mike-north/formspec/commit/a59effefdf7d59ecbed7e51cb241f9ddfdd8649d) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Remove `extractPayload` from `CustomTypeRegistration`. The callback was added in #300 for `Ref<T>` support but is no longer needed — #308 fixes the underlying stack overflow by skipping full expansion of large external type arguments, allowing formspec's existing object resolution and discriminator pipeline to handle `Ref<T>` correctly.

### Patch Changes

- Updated dependencies [[`a59effe`](https://github.com/mike-north/formspec/commit/a59effefdf7d59ecbed7e51cb241f9ddfdd8649d)]:
  - @formspec/core@0.1.0-alpha.55

## 0.1.0-alpha.54

### Minor Changes

- [#300](https://github.com/mike-north/formspec/pull/300) [`7288e3b`](https://github.com/mike-north/formspec/commit/7288e3b105fa49a23db18eb0dda504b0da898239) Thanks [@brooks-stripe](https://github.com/brooks-stripe)! - Add optional `extractPayload` callback to `CustomTypeRegistration`. When defined, the callback is invoked during type analysis with the TypeScript type and checker, and its return value is stored as the custom type node's `payload`. This payload is then passed to `toJsonSchema` during schema generation, enabling extensions to carry type-level information (e.g., a generic argument's resolved literal value) through to JSON Schema output.

### Patch Changes

- Updated dependencies [[`7288e3b`](https://github.com/mike-north/formspec/commit/7288e3b105fa49a23db18eb0dda504b0da898239)]:
  - @formspec/core@0.1.0-alpha.54

## 0.1.0-alpha.53

### Minor Changes

- [#298](https://github.com/mike-north/formspec/pull/298) [`9987858`](https://github.com/mike-north/formspec/commit/9987858929d9101c8b4a7ea6b272d14c21cb7f32) Thanks [@mike-north](https://github.com/mike-north)! - Add pino-based debug logging with a `DEBUG=formspec:*` enable convention.

  Apps (`@formspec/cli`, the `@formspec/build` CLI, and `@formspec/language-server`) construct pino loggers inline and route output to stderr, stderr, and the LSP connection console respectively. `@formspec/ts-plugin` wraps `ts.server.Logger` via `fromTsLogger` so diagnostics flow through the tsserver log file instead of stdio.

  Libraries (`@formspec/build`, `@formspec/analysis`, `@formspec/runtime`, `@formspec/config`) now accept an optional `logger?: LoggerLike` on their public entry points, defaulting to a silent no-op. They never import pino directly, so consumers do not pick up pino as a transitive dependency.

  `@formspec/core` exports the shared `LoggerLike` interface, `noopLogger` constant, and the `isNamespaceEnabled` matcher used across all apps. The umbrella `formspec` package re-exports `LoggerLike` and `noopLogger`.

### Patch Changes

- Updated dependencies [[`9987858`](https://github.com/mike-north/formspec/commit/9987858929d9101c8b4a7ea6b272d14c21cb7f32)]:
  - @formspec/core@0.1.0-alpha.53

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

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Introduce unified `FormSpecConfig` system. Rename `@formspec/constraints` to `@formspec/config`. All consumers (build, CLI, ESLint, language server) now accept a `FormSpecConfig` object carrying extensions, constraints, metadata, vendor prefix, and enum serialization. Adds `defineFormSpecConfig` identity function, `loadFormSpecConfig` with jiti-based TypeScript config file loading, `resolveConfigForFile` for monorepo per-package overrides, and `withConfig()` factory on the ESLint plugin. Removes the outdated playground package. See docs/007-configuration.md for the full spec.

### Patch Changes

- [#265](https://github.com/mike-north/formspec/pull/265) [`40e95ec`](https://github.com/mike-north/formspec/commit/40e95ec658d23e3b72d9328c81956fd6c8737f4c) Thanks [@mike-north](https://github.com/mike-north)! - Fix TYPE_MISMATCH false positive when built-in numeric constraints (`@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`) are applied to custom types that register `builtinConstraintBroadenings`. The validator now consults the extension registry before rejecting constraints on non-numeric types.

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

## 0.1.0-alpha.33

### Patch Changes

- [#226](https://github.com/mike-north/formspec/pull/226) [`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata slot registration types and validation plumbing so extensions can define tooling-facing metadata tags and analysis slots across the core/build/analysis stack.

- Updated dependencies [[`87efbca`](https://github.com/mike-north/formspec/commit/87efbca3c8b98d601f247c84a037089e2b5856a3)]:
  - @formspec/core@0.1.0-alpha.33

## 0.1.0-alpha.29

### Patch Changes

- [#206](https://github.com/mike-north/formspec/pull/206) [`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata policy and resolved metadata support across core, the DSL factory surface, and build generation. JSON Schema and UI Schema now honor resolved `apiName` and `displayName`, mixed-authoring merges metadata by explicit-vs-inferred precedence, and discriminator resolution supports literal identity properties plus metadata-driven names for object-like generic sources.

- Updated dependencies [[`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20)]:
  - @formspec/core@0.1.0-alpha.29

## 0.1.0-alpha.28

### Patch Changes

- [#199](https://github.com/mike-north/formspec/pull/199) [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf) Thanks [@mike-north](https://github.com/mike-north)! - Declare MIT licensing across package metadata and README documentation.

- Updated dependencies [[`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf)]:
  - @formspec/core@0.1.0-alpha.28

## 0.1.0-alpha.27

### Patch Changes

- [#192](https://github.com/mike-north/formspec/pull/192) [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c) Thanks [@mike-north](https://github.com/mike-north)! - Prune public API surface and promote Zod validation schemas

  Move extension authoring types, mixed authoring generator, and implementation-detail types from `@public` to `@internal`. Promote `jsonSchema7Schema`, `uiSchemaSchema`, and the JSON Schema 7 type family to `@public` on the main `@formspec/build` entry point.

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

- Updated dependencies [[`ef268b3`](https://github.com/mike-north/formspec/commit/ef268b37c5e9a0fca0b69d1efecb27315a00a211), [`e9cdb20`](https://github.com/mike-north/formspec/commit/e9cdb2025fb74dec3f1aab46aa9ebc0c675e45db)]:
  - @formspec/core@0.1.0-alpha.23

## 0.1.0-alpha.21

### Patch Changes

- [#172](https://github.com/mike-north/formspec/pull/172) [`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c) Thanks [@mike-north](https://github.com/mike-north)! - Remove @description tag; use TSDoc summary text for JSON Schema description and @remarks for x-vendor-remarks extension keyword

- Updated dependencies [[`fafddcf`](https://github.com/mike-north/formspec/commit/fafddcf6fe8ef99263016390c92cad23f3bbef4c)]:
  - @formspec/core@0.1.0-alpha.21

## 0.1.0-alpha.19

### Patch Changes

- Updated dependencies [[`1df7e34`](https://github.com/mike-north/formspec/commit/1df7e343b4fc17746c9a624ac5339db0071bc187)]:
  - @formspec/core@0.1.0-alpha.19

## 0.1.0-alpha.17

### Patch Changes

- Updated dependencies [[`dbc6c21`](https://github.com/mike-north/formspec/commit/dbc6c219be95d9481afa9936eb3b81c7f446fb65)]:
  - @formspec/core@0.1.0-alpha.17

## 0.1.0-alpha.16

### Patch Changes

- Updated dependencies [[`d7f10fe`](https://github.com/mike-north/formspec/commit/d7f10fe7d3d855a99423baec3996bebd47f80190), [`889470b`](https://github.com/mike-north/formspec/commit/889470b4b3ab9d4bf9ed72169e083a2887256f57)]:
  - @formspec/core@0.1.0-alpha.16

## 0.1.0-alpha.14

### Patch Changes

- Updated dependencies [[`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec)]:
  - @formspec/core@0.1.0-alpha.14

## 0.1.0-alpha.13

### Patch Changes

- Updated dependencies [[`bc76a57`](https://github.com/mike-north/formspec/commit/bc76a57ffe1934c485aec0c9e1143cc5203c429c)]:
  - @formspec/core@0.1.0-alpha.13

## 0.1.0-alpha.12

### Patch Changes

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

- Updated dependencies [[`4d1b327`](https://github.com/mike-north/formspec/commit/4d1b327b420f52115bcd66367ee901a23b371890)]:
  - @formspec/core@0.1.0-alpha.12

## 0.1.0-alpha.11

### Patch Changes

- [#49](https://github.com/mike-north/formspec/pull/49) [`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b) Thanks [@mike-north](https://github.com/mike-north)! - Add dual CJS/ESM builds via tsup and API Extractor for all published packages

  All published packages now ship both ESM (.js) and CJS (.cjs) output, built by tsup. API Extractor generates rolled-up .d.ts declaration files for all 9 packages (previously missing for @formspec/decorators and @formspec/cli).

- Updated dependencies [[`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b)]:
  - @formspec/core@0.1.0-alpha.11

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [[`15519c3`](https://github.com/mike-north/formspec/commit/15519c393904ed73748f3de8dd1a07b28cfdcf41)]:
  - @formspec/core@0.1.0-alpha.10

## 0.1.0-alpha.9

### Patch Changes

- Updated dependencies [[`f598436`](https://github.com/mike-north/formspec/commit/f598436187e881d777259e794005bb4980abca21)]:
  - @formspec/core@0.1.0-alpha.9

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

### Patch Changes

- [#29](https://github.com/mike-north/formspec/pull/29) [`5c3cdbf`](https://github.com/mike-north/formspec/commit/5c3cdbfbb6c10ce80722917decd8d16f496e3202) Thanks [@mike-north](https://github.com/mike-north)! - Fix type errors and improve test coverage in constraints package
  - Fix `extractFieldOptions` to correctly map `min`/`max` properties from `NumberField` to `minValue`/`maxValue` constraints
  - Add missing `custom` property to `DEFAULT_CONSTRAINTS.controlOptions`
  - Fix ESLint violations (nullish coalescing, unnecessary conditionals, template expressions)
  - Add comprehensive tests for helper functions: `isFieldTypeAllowed`, `getFieldTypeSeverity`, `isFieldOptionAllowed`, `getFieldOptionSeverity`, `isLayoutTypeAllowed`, `isNestingDepthAllowed`
  - Add tests for `validateFormSpec` wrapper function
  - Add edge case tests for empty elements and deeply nested objects
  - Increase test count from 35 to 72
