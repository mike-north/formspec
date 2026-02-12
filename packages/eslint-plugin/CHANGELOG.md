# @formspec/eslint-plugin

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
