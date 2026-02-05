# formspec

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
