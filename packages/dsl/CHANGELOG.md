# @formspec/dsl

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

## 0.1.0-alpha.8

### Patch Changes

- [#32](https://github.com/mike-north/formspec/pull/32) [`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98) Thanks [@mike-north](https://github.com/mike-north)! - Fix all ESLint errors and add lint enforcement to CI
  - Fix 213 lint errors across 6 packages (build, cli, decorators, dsl, eslint-plugin, runtime)
  - Add lint step to CI workflow to enforce rules on all future PRs
  - Fixes include: proper null checks, type assertions, array syntax, template literals, and unused variable handling

## 0.1.0-alpha.6

### Patch Changes

- [#27](https://github.com/mike-north/formspec/pull/27) [`7b3d95d`](https://github.com/mike-north/formspec/commit/7b3d95d9b51664f7156bc753cfcd64d3bd3bda22) Thanks [@mike-north](https://github.com/mike-north)! - Improve DX based on second round of evaluation feedback

  **@formspec/cli:**
  - Improved error messages to distinguish between "compiled file missing" and "no FormSpec exports found"
  - Error messages now use `npx formspec` for users without CLI in PATH
  - Added documentation for `codegen` command
  - Added documentation explaining `ux_spec.json` vs JSON Forms `uiSchema` format

  **@formspec/dsl:**
  - Fixed type inference so fields inside `when()` conditionals are correctly typed as optional
  - Added `FlattenIntersection` utility type (exported)
  - Added `ExtractNonConditionalFields` and `ExtractConditionalFields` types with TSDoc examples

## 0.1.0-alpha.5

### Minor Changes

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

## 0.1.0-alpha.2

### Minor Changes

- [#7](https://github.com/mike-north/formspec/pull/7) [`b42319d`](https://github.com/mike-north/formspec/commit/b42319dce2f0652a9f6e6d46ae1f411b71c1b2d7) Thanks [@mike-north](https://github.com/mike-north)! - Add support for object-based enum options with separate id and label

  Enum fields can now use object options with `id` and `label` properties, allowing the stored value to differ from the display text.

  ### New types
  - `EnumOption` - Interface for object-based enum options with `id` and `label`
  - `EnumOptionValue` - Union type accepting both string and object options

  ### Usage

  ```typescript
  // String options (existing behavior)
  field.enum("status", ["draft", "sent", "paid"]);

  // Object options (new)
  field.enum("priority", [
    { id: "low", label: "Low Priority" },
    { id: "high", label: "High Priority" },
  ]);
  ```

  ### JSON Schema generation

  Object-based enum options generate `oneOf` schemas with `const` and `title` properties instead of the `enum` keyword, preserving both the value and display label in the schema.

### Patch Changes

- Updated dependencies [[`b42319d`](https://github.com/mike-north/formspec/commit/b42319dce2f0652a9f6e6d46ae1f411b71c1b2d7)]:
  - @formspec/core@0.1.0-alpha.2

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
