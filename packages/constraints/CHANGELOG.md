# @formspec/constraints

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
