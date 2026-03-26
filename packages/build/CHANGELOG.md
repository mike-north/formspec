# @formspec/build

## 0.1.0-alpha.15

### Minor Changes

- [#125](https://github.com/mike-north/formspec/pull/125) [`e72c621`](https://github.com/mike-north/formspec/commit/e72c621781af2f71e1b51b168f1f6c9dc7b40195) Thanks [@mike-north](https://github.com/mike-north)! - Expose extension registry support on the public build surface so custom types,
  custom constraints, and custom annotations can be emitted honestly through
  `generateJsonSchemaFromIR()` and related schema-generation helpers.

- [#122](https://github.com/mike-north/formspec/pull/122) [`568f7e5`](https://github.com/mike-north/formspec/commit/568f7e5db40d2606ecbf0e535212e0f0973c5036) Thanks [@mike-north](https://github.com/mike-north)! - Add semantic `CONSTRAINT_BROADENING` diagnostics when later built-in numeric or length bounds are less restrictive than earlier inherited bounds, and surface them through CLI validation output.

- [#109](https://github.com/mike-north/formspec/pull/109) [`0526742`](https://github.com/mike-north/formspec/commit/0526742817ef372e968b582d579bc79fdf9f17aa) Thanks [@mike-north](https://github.com/mike-north)! - Remove legacy `@Field_displayName` and `@Field_description` support in favor of canonical `@displayName` and `@description` tags.

  This is a breaking change for schemas that still use the legacy `@Field_displayName` and `@Field_description` tags.

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

- [#121](https://github.com/mike-north/formspec/pull/121) [`ac69f33`](https://github.com/mike-north/formspec/commit/ac69f3376f1d5b8193b79a20d023b13e5ca82a8c) Thanks [@mike-north](https://github.com/mike-north)! - Tighten path-target validation so semantic diagnostics now resolve nested targets and reject invalid path-targeted constraints on incompatible nested types

## 0.1.0-alpha.14

### Minor Changes

- [#72](https://github.com/mike-north/formspec/pull/72) [`ed89d72`](https://github.com/mike-north/formspec/commit/ed89d72863ad475e811d0d9c0c406816d65fda6d) Thanks [@mike-north](https://github.com/mike-north)! - Add path-target syntax for constraint tags: `:fieldName` modifier targets a specific subproperty of a complex-typed field (e.g., `@minimum :value 0` constrains the `value` subproperty of a named type)

### Patch Changes

- [#83](https://github.com/mike-north/formspec/pull/83) [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec) Thanks [@mike-north](https://github.com/mike-north)! - Fix path-target constraint traversability check: validation now correctly rejects constraints targeting non-traversable types (e.g., primitives) via the `:path` modifier

- [#83](https://github.com/mike-north/formspec/pull/83) [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec) Thanks [@mike-north](https://github.com/mike-north)! - Fix prototype pollution vulnerability in `isBuiltinConstraintName`: guard now uses `Object.hasOwn()` instead of the `in` operator, preventing `__proto__` and inherited properties from being treated as valid constraint names

- [#83](https://github.com/mike-north/formspec/pull/83) [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec) Thanks [@mike-north](https://github.com/mike-north)! - Internal: replace `as` casts with type guards and TypeScript narrowing in the TSDoc analyzer pipeline; extract `tryParseJson` utility to eliminate duplicated JSON parsing patterns

- Updated dependencies [[`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec)]:
  - @formspec/core@0.1.0-alpha.14

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

## 0.1.0-alpha.11

### Minor Changes

- [#47](https://github.com/mike-north/formspec/pull/47) [`9143266`](https://github.com/mike-north/formspec/commit/9143266fa69ff4bd8f6232c997ce7d2d070bef4e) Thanks [@mike-north](https://github.com/mike-north)! - Unify UI Schema output: both chain DSL and decorator DSL now produce JSON Forms-compliant UI Schema, validated at generation time via Zod schemas.

  **Breaking:** `ClassSchemas.uiSchema` and `GenerateFromClassResult.uiSchema` changed from `{ elements: FormSpecField[] }` to `UISchema` (a JSON Forms VerticalLayout with Controls, Groups, and rules). Consumers accessing `.uiSchema.elements[n]._field` or `.uiSchema.elements[n].id` must update to use the JSON Forms structure (`.uiSchema.elements[n].scope`, `.uiSchema.elements[n].type`).

  New exports: `generateUiSchemaFromFields()`, Zod validation schemas (`uiSchemaSchema`, `jsonSchema7Schema`, `controlSchema`, `ruleSchema`, etc.), and types (`Categorization`, `Category`, `LabelElement`).

### Patch Changes

- [#49](https://github.com/mike-north/formspec/pull/49) [`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b) Thanks [@mike-north](https://github.com/mike-north)! - Add dual CJS/ESM builds via tsup and API Extractor for all published packages

  All published packages now ship both ESM (.js) and CJS (.cjs) output, built by tsup. API Extractor generates rolled-up .d.ts declaration files for all 9 packages (previously missing for @formspec/decorators and @formspec/cli).

- Updated dependencies [[`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b)]:
  - @formspec/core@0.1.0-alpha.11

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
  - @formspec/core@0.1.0-alpha.10

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

## 0.1.0-alpha.8

### Patch Changes

- [#32](https://github.com/mike-north/formspec/pull/32) [`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98) Thanks [@mike-north](https://github.com/mike-north)! - Fix all ESLint errors and add lint enforcement to CI
  - Fix 213 lint errors across 6 packages (build, cli, decorators, dsl, eslint-plugin, runtime)
  - Add lint step to CI workflow to enforce rules on all future PRs
  - Fixes include: proper null checks, type assertions, array syntax, template literals, and unused variable handling

## 0.1.0-alpha.7

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

## 0.1.0-alpha.0

### Patch Changes

- Updated dependencies [[`7a42311`](https://github.com/mike-north/formspec/commit/7a423116ca507f9a52dda94ba1238bf7bdb2b949)]:
  - @formspec/core@0.1.0-alpha.0
