# formspec

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
