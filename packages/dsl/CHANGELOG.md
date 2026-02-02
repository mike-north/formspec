# @formspec/dsl

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
