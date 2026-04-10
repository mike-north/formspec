# @formspec/cli

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

### Patch Changes

- [#206](https://github.com/mike-north/formspec/pull/206) [`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20) Thanks [@mike-north](https://github.com/mike-north)! - Add metadata policy and resolved metadata support across core, the DSL factory surface, and build generation. JSON Schema and UI Schema now honor resolved `apiName` and `displayName`, mixed-authoring merges metadata by explicit-vs-inferred precedence, and discriminator resolution supports literal identity properties plus metadata-driven names for object-like generic sources.

- Updated dependencies [[`c26d886`](https://github.com/mike-north/formspec/commit/c26d886cf61cfdbe3ec6ac590d481cc6a3962f20)]:
  - @formspec/build@0.1.0-alpha.29

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

## 0.1.0-alpha.27

### Patch Changes

- [#196](https://github.com/mike-north/formspec/pull/196) [`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd) Thanks [@mike-north](https://github.com/mike-north)! - Tighten API Extractor surface enforcement by promoting forgotten exports to errors and cleaning up leaked public types across analysis, ts-plugin, eslint-plugin, and formspec.

- [#192](https://github.com/mike-north/formspec/pull/192) [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c) Thanks [@mike-north](https://github.com/mike-north)! - Prune public API surface and promote Zod validation schemas

  Move extension authoring types, mixed authoring generator, and implementation-detail types from `@public` to `@internal`. Promote `jsonSchema7Schema`, `uiSchemaSchema`, and the JSON Schema 7 type family to `@public` on the main `@formspec/build` entry point.

- [#195](https://github.com/mike-north/formspec/pull/195) [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827) Thanks [@mike-north](https://github.com/mike-north)! - Tighten exported API surfaces so the published declarations, API Extractor rollups, and generated docs stay aligned.

  This promotes a small set of already-exposed types to supported public exports, replaces a few leaked internal type references with public ones, and keeps the root workspace lint from traversing nested agent worktrees.

- [#194](https://github.com/mike-north/formspec/pull/194) [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030) Thanks [@mike-north](https://github.com/mike-north)! - Repair the public tooling entrypoints after the API rollup refactor and add program-backed schema generation in `@formspec/build`.

- Updated dependencies [[`af1d71a`](https://github.com/mike-north/formspec/commit/af1d71a3559f6a66706d262cc273ef3df87206dd), [`c70b3fe`](https://github.com/mike-north/formspec/commit/c70b3febb26973eff6adb7779e29c84e500bb31c), [`535c233`](https://github.com/mike-north/formspec/commit/535c233861238bb749652e4879c05bd9e1b01827), [`b9843c9`](https://github.com/mike-north/formspec/commit/b9843c916cba234cf13d4dab53e3ff13e439c030)]:
  - @formspec/build@0.1.0-alpha.27

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
  - @formspec/build@0.1.0-alpha.21

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

## 0.1.0-alpha.17

### Patch Changes

- Updated dependencies [[`dbc6c21`](https://github.com/mike-north/formspec/commit/dbc6c219be95d9481afa9936eb3b81c7f446fb65)]:
  - @formspec/build@0.1.0-alpha.17

## 0.1.0-alpha.16

### Minor Changes

- [#128](https://github.com/mike-north/formspec/pull/128) [`d7f10fe`](https://github.com/mike-north/formspec/commit/d7f10fe7d3d855a99423baec3996bebd47f80190) Thanks [@mike-north](https://github.com/mike-north)! - Expose class/type-level annotation metadata through generated JSON Schema and UI Schema output, including root titles/descriptions, placeholder UI hints, deprecated messages, and default values.

- [#132](https://github.com/mike-north/formspec/pull/132) [`111c021`](https://github.com/mike-north/formspec/commit/111c021c13a4468a57d0c2291ff3aa77133117a0) Thanks [@mike-north](https://github.com/mike-north)! - Support recursive named types in canonical IR generation and JSON Schema
  emission, including circular class/interface references and recursive
  `$defs`/`$ref` output.

  This also fixes a regression where named non-recursive record aliases could be
  lifted into `$defs` instead of staying inline as record schemas.

- [#130](https://github.com/mike-north/formspec/pull/130) [`6276145`](https://github.com/mike-north/formspec/commit/6276145056bf1510b9ea785a22e1503ec2a658f7) Thanks [@mike-north](https://github.com/mike-north)! - Emit semantic `UNKNOWN_PATH_TARGET` diagnostics when path-targeted constraints
  reference missing nested properties, and remove CLI test harness skips by
  compiling runtime fixtures on demand during tests.

### Patch Changes

- Updated dependencies [[`d7f10fe`](https://github.com/mike-north/formspec/commit/d7f10fe7d3d855a99423baec3996bebd47f80190), [`2acf352`](https://github.com/mike-north/formspec/commit/2acf3529a93ad70801073503c13e505ccef8a23b), [`889470b`](https://github.com/mike-north/formspec/commit/889470b4b3ab9d4bf9ed72169e083a2887256f57), [`271071e`](https://github.com/mike-north/formspec/commit/271071ed46833db97a81407557ad5c52e697b8b0), [`111c021`](https://github.com/mike-north/formspec/commit/111c021c13a4468a57d0c2291ff3aa77133117a0), [`6276145`](https://github.com/mike-north/formspec/commit/6276145056bf1510b9ea785a22e1503ec2a658f7)]:
  - @formspec/build@0.1.0-alpha.16

## 0.1.0-alpha.15

### Minor Changes

- [#122](https://github.com/mike-north/formspec/pull/122) [`568f7e5`](https://github.com/mike-north/formspec/commit/568f7e5db40d2606ecbf0e535212e0f0973c5036) Thanks [@mike-north](https://github.com/mike-north)! - Add semantic `CONSTRAINT_BROADENING` diagnostics when later built-in numeric or length bounds are less restrictive than earlier inherited bounds, and surface them through CLI validation output.

- [#109](https://github.com/mike-north/formspec/pull/109) [`0526742`](https://github.com/mike-north/formspec/commit/0526742817ef372e968b582d579bc79fdf9f17aa) Thanks [@mike-north](https://github.com/mike-north)! - Remove legacy `@Field_displayName` and `@Field_description` support in favor of canonical `@displayName` and `@description` tags.

  This is a breaking change for schemas that still use the legacy `@Field_displayName` and `@Field_description` tags.

- [#124](https://github.com/mike-north/formspec/pull/124) [`3f864b8`](https://github.com/mike-north/formspec/commit/3f864b887f7ad3cfb765f04ceeb76d999a300055) Thanks [@mike-north](https://github.com/mike-north)! - Add `--dry-run` to `formspec generate` so callers can inspect planned output files, including `schema.json`, `ui_schema.json`, `params.ui_schema.json`, and optional `*.ir.json` files, without writing anything to disk.

- [#116](https://github.com/mike-north/formspec/pull/116) [`3cf95b1`](https://github.com/mike-north/formspec/commit/3cf95b120cbf04a1f443f1b825682383f7da6d14) Thanks [@mike-north](https://github.com/mike-north)! - Preserve enum member display-name annotations in the static analysis pipeline so
  schemas emit per-member `title` values via `oneOf` entries for
  `@displayName :member Label` syntax.

- [#117](https://github.com/mike-north/formspec/pull/117) [`6b0930e`](https://github.com/mike-north/formspec/commit/6b0930ee43131c10d48222ccdd687746a252b505) Thanks [@mike-north](https://github.com/mike-north)! - Align generated object and type-mapping schemas with the current spec. Ordinary
  object schemas now omit `additionalProperties: false` by default, while
  nullable unions, named type `$defs`/`$ref` usage, and unconstrained
  `Record<string, T>` mappings are covered and preserved by normative end-to-end
  tests.

- [#112](https://github.com/mike-north/formspec/pull/112) [`5752b5c`](https://github.com/mike-north/formspec/commit/5752b5c3d77f0cd1a2183a0794ce5889702cb9f2) Thanks [@mike-north](https://github.com/mike-north)! - Switch constraint validation to semantic diagnostic codes such as `CONTRADICTING_CONSTRAINTS`, `TYPE_MISMATCH`, and `UNKNOWN_EXTENSION`.

  The CLI now prints those codes with cwd-relative source locations so validation output is stable and reviewable in tests and downstream tooling.

### Patch Changes

- [#108](https://github.com/mike-north/formspec/pull/108) [`c0062bf`](https://github.com/mike-north/formspec/commit/c0062bff2ebfe480b3a0b03c95146e92af183483) Thanks [@mike-north](https://github.com/mike-north)! - Improve CLI subprocess behavior for syntax errors and compiled-module load failures.

  The CLI now surfaces TypeScript syntax diagnostics directly instead of falling through to a misleading class lookup failure, and it preserves the actual compiled-module load error when chain DSL exports cannot be imported.

- Updated dependencies [[`e72c621`](https://github.com/mike-north/formspec/commit/e72c621781af2f71e1b51b168f1f6c9dc7b40195), [`568f7e5`](https://github.com/mike-north/formspec/commit/568f7e5db40d2606ecbf0e535212e0f0973c5036), [`ac69f33`](https://github.com/mike-north/formspec/commit/ac69f3376f1d5b8193b79a20d023b13e5ca82a8c), [`0526742`](https://github.com/mike-north/formspec/commit/0526742817ef372e968b582d579bc79fdf9f17aa), [`3cf95b1`](https://github.com/mike-north/formspec/commit/3cf95b120cbf04a1f443f1b825682383f7da6d14), [`6b0930e`](https://github.com/mike-north/formspec/commit/6b0930ee43131c10d48222ccdd687746a252b505), [`5752b5c`](https://github.com/mike-north/formspec/commit/5752b5c3d77f0cd1a2183a0794ce5889702cb9f2)]:
  - @formspec/build@0.1.0-alpha.15

## 0.1.0-alpha.14

### Patch Changes

- Updated dependencies [[`ed89d72`](https://github.com/mike-north/formspec/commit/ed89d72863ad475e811d0d9c0c406816d65fda6d), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec)]:
  - @formspec/build@0.1.0-alpha.14

## 0.1.0-alpha.13

### Patch Changes

- Updated dependencies [[`bc76a57`](https://github.com/mike-north/formspec/commit/bc76a57ffe1934c485aec0c9e1143cc5203c429c)]:
  - @formspec/build@0.1.0-alpha.13

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
  - @formspec/build@0.1.0-alpha.12

## 0.1.0-alpha.11

### Patch Changes

- [#49](https://github.com/mike-north/formspec/pull/49) [`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b) Thanks [@mike-north](https://github.com/mike-north)! - Add dual CJS/ESM builds via tsup and API Extractor for all published packages

  All published packages now ship both ESM (.js) and CJS (.cjs) output, built by tsup. API Extractor generates rolled-up .d.ts declaration files for all 9 packages (previously missing for @formspec/decorators and @formspec/cli).

- Updated dependencies [[`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b), [`9143266`](https://github.com/mike-north/formspec/commit/9143266fa69ff4bd8f6232c997ce7d2d070bef4e)]:
  - @formspec/build@0.1.0-alpha.11

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [[`15519c3`](https://github.com/mike-north/formspec/commit/15519c393904ed73748f3de8dd1a07b28cfdcf41)]:
  - @formspec/build@0.1.0-alpha.10

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
  - @formspec/build@0.1.0-alpha.9

## 0.1.0-alpha.8

### Patch Changes

- [#32](https://github.com/mike-north/formspec/pull/32) [`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98) Thanks [@mike-north](https://github.com/mike-north)! - Fix all ESLint errors and add lint enforcement to CI
  - Fix 213 lint errors across 6 packages (build, cli, decorators, dsl, eslint-plugin, runtime)
  - Add lint step to CI workflow to enforce rules on all future PRs
  - Fixes include: proper null checks, type assertions, array syntax, template literals, and unused variable handling

- Updated dependencies [[`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98)]:
  - @formspec/build@0.1.0-alpha.8

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [[`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f)]:
  - @formspec/build@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- [#27](https://github.com/mike-north/formspec/pull/27) [`7b3d95d`](https://github.com/mike-north/formspec/commit/7b3d95d9b51664f7156bc753cfcd64d3bd3bda22) Thanks [@mike-north](https://github.com/mike-north)! - Improve DX based on second round of evaluation feedback

  **@formspec/cli:**
  - Improved error messages to distinguish between "compiled file missing" and "no FormSpec exports found"
  - Error messages now use `npx formspec` for users without CLI in PATH
  - Added documentation for `codegen` command
  - Added documentation explaining the JSON Forms UI Schema output contract and the `ui_schema.json` / `params.ui_schema.json` file names

  **@formspec/dsl:**
  - Fixed type inference so fields inside `when()` conditionals are correctly typed as optional
  - Added `FlattenIntersection` utility type (exported)
  - Added `ExtractNonConditionalFields` and `ExtractConditionalFields` types with TSDoc examples

- Updated dependencies []:
  - @formspec/build@0.1.0-alpha.5

## 0.1.0-alpha.5

### Patch Changes

- [#22](https://github.com/mike-north/formspec/pull/22) [`a4b341d`](https://github.com/mike-north/formspec/commit/a4b341d42adaacf6f7e8fa79139575a41b181e84) Thanks [@mike-north](https://github.com/mike-north)! - Add DX improvements across FormSpec packages

  **P4-3: EnumOptions Record Shorthand**

  You can now use a more concise record format for `@EnumOptions`:

  ```typescript
  // New shorthand format
  @EnumOptions({ admin: "Administrator", user: "Regular User" })
  role!: "admin" | "user";

  // Equivalent to the existing array format
  @EnumOptions([
    { id: "admin", label: "Administrator" },
    { id: "user", label: "Regular User" }
  ])
  ```

  **P4-1: Auto-generate Enum Options from Union Types**

  When `@EnumOptions` is not present, options are now automatically generated with `{ id, label }` format where both values match the union member:

  ```typescript
  // Without @EnumOptions
  status!: "draft" | "published";
  // Auto-generates: [{ id: "draft", label: "draft" }, { id: "published", label: "published" }]
  ```

  These changes make it faster to define enum fields while maintaining full backward compatibility with the existing array format.

  **Additional DX Improvements**
  - **@formspec/dsl**: Duplicate field names are now reported as errors instead of warnings
  - **@formspec/build**: Fixed duplicate entries in JSON Schema `required` arrays
  - **@formspec/cli**: Added `--help` for subcommands, warn on unexported decorated classes
  - **@formspec/decorators**: Added `@Group` decorator support for UI schema grouping

- Updated dependencies [[`a4b341d`](https://github.com/mike-north/formspec/commit/a4b341d42adaacf6f7e8fa79139575a41b181e84)]:
  - @formspec/build@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- [#18](https://github.com/mike-north/formspec/pull/18) [`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b) Thanks [@mike-north](https://github.com/mike-north)! - Add README.md documentation to all npm packages
  - Added comprehensive README.md files to formspec, @formspec/core, @formspec/build, and @formspec/runtime
  - Added ESM requirements section to all package READMEs
  - Updated package.json files to include README.md in published packages

  This addresses DX evaluation feedback that published packages lacked documentation,
  making it difficult for new users to get started.

- Updated dependencies [[`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b), [`96f08ac`](https://github.com/mike-north/formspec/commit/96f08acc744ca1de8f8ca58be15e51844aba29e9)]:
  - @formspec/build@0.1.0-alpha.4

## 0.1.0-alpha.3

### Minor Changes

- [#14](https://github.com/mike-north/formspec/pull/14) [`7d81c70`](https://github.com/mike-north/formspec/commit/7d81c708b90a41df9a75ea3b3b9da0ecf912ba6c) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/cli package for static TypeScript analysis and schema generation

  This new package provides a CLI tool that generates JSON Schema and JSON Forms UI Schema from TypeScript source files using a hybrid approach:

  **Static Analysis (TypeScript Compiler API):**
  - Extracts class fields with their TypeScript types
  - Parses decorator metadata (@Label, @Min, @Max, etc.)
  - Detects method parameters using `InferSchema<typeof X>` pattern
  - Converts TypeScript types to JSON Schema and FormSpec fields

  **Runtime Execution (Dynamic Import):**
  - Loads exported FormSpec constants (chain DSL) at runtime
  - Uses @formspec/build generators to produce schemas
  - Enables full FormSpec features for method parameters

  **Usage:**

  ```bash
  # Generate schemas from a class with decorators
  formspec generate ./src/forms.ts MyClass -o ./generated

  # Generate schemas from all FormSpec exports (chain DSL)
  formspec generate ./src/forms.ts -o ./generated
  ```

  **Output Structure:**

  ```
  generated/ClassName/
  ├── schema.json           # JSON Schema for class fields
  ├── ui_schema.json        # JSON Forms UI Schema
  ├── instance_methods/
  │   └── methodName/
  │       ├── params.schema.json
  │       ├── params.ui_schema.json     # emitted when FormSpec-based params UI schema is available
  │       └── return_type.schema.json
  └── static_methods/
      └── ...

  generated/formspecs/
  └── ExportName/
      ├── schema.json
      └── ui_schema.json
  ```

  This approach eliminates the need for type-hint decorators like `@Boolean()` since types are inferred directly from TypeScript.

- [#15](https://github.com/mike-north/formspec/pull/15) [`7b29657`](https://github.com/mike-north/formspec/commit/7b2965758ff04479cd0e1ad32866a35e4e86b6b4) Thanks [@mike-north](https://github.com/mike-north)! - Add type-safe schema inference to codegen output

  The `formspec codegen` command now generates additional TypeScript types for improved developer experience:

  **Generated Types:**
  - Schema types (e.g., `UserFormSchema`) - Represents the form **data structure** with exact literal types inferred from TypeScript
  - Element tuple types (e.g., `UserFormElements`) - Internal type representing the field array with exact literal types
  - Typed accessor functions (e.g., `getUserFormFormSpec()`) - Type-safe FormSpec access with full type information

  **Benefits:**
  - Same level of type inference as Chain DSL
  - Autocomplete for enum values and field names
  - Compile-time checking of form data structure
  - IDE support for navigating schema properties

  **Breaking Changes:**
  None. This is a purely additive change - existing codegen output remains valid.

  **Migration:**
  No migration required. Re-run `formspec codegen` to regenerate files with new types:

  ```bash
  formspec codegen ./src/forms.ts -o ./src/__formspec_types__.ts
  ```

  Then update your imports to use the new types:

  ```typescript
  // Before (still works)
  import "./__formspec_types__";
  import { toFormSpec } from "@formspec/decorators";
  const spec = toFormSpec(UserForm);

  // After (with type safety)
  import { getUserFormFormSpec, type UserFormSchema } from "./__formspec_types__";
  const spec = getUserFormFormSpec();
  ```

  **Usage Example:**

  ```typescript
  import { UserFormSchema, getUserFormFormSpec } from "./__formspec_types__";

  // Type-safe form data with autocomplete
  const data: UserFormSchema = {
    name: "Alice",
    country: "us", // IDE shows valid options: "us" | "ca"
  };

  // Type error caught at compile time
  const invalid: UserFormSchema = {
    name: "Bob",
    country: "invalid", // ❌ Error: Type '"invalid"' is not assignable
  };

  // Type-safe spec access with literal types
  const spec = getUserFormFormSpec();
  spec.elements[0]._field; // Type: "text" (literal, not string!)
  spec.elements[0].id; // Type: "name" (literal, enables type-safe field access)
  ```

  This brings decorator-based forms to feature parity with the Chain DSL for type safety.

### Patch Changes

- [#14](https://github.com/mike-north/formspec/pull/14) [`7d81c70`](https://github.com/mike-north/formspec/commit/7d81c708b90a41df9a75ea3b3b9da0ecf912ba6c) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/decorators package and improve CLI developer experience

  **New Package: @formspec/decorators**
  - Provides all decorator stubs for FormSpec CLI static analysis
  - Zero runtime overhead - decorators are no-ops
  - Eliminates need to copy-paste decorator stubs manually

  **CLI Improvements:**
  - Updated README with example output showing generated JSON
  - Simplified decorator setup: just `npm install @formspec/decorators`
  - Nested object types now include `fields` array in UI Schema for form rendering
  - Clarified that `emitDecoratorMetadata` is not required
