# @formspec/playground

## 0.1.0-alpha.18

### Patch Changes

- Updated dependencies [[`96bd65a`](https://github.com/mike-north/formspec/commit/96bd65a154838597e07d7aabf02619803eac155e)]:
  - @formspec/eslint-plugin@0.1.0-alpha.18

## 0.1.0-alpha.17

### Patch Changes

- Updated dependencies [[`dbc6c21`](https://github.com/mike-north/formspec/commit/dbc6c219be95d9481afa9936eb3b81c7f446fb65)]:
  - @formspec/build@0.1.0-alpha.17
  - @formspec/core@0.1.0-alpha.17
  - @formspec/constraints@0.1.0-alpha.17
  - @formspec/dsl@0.1.0-alpha.17
  - @formspec/eslint-plugin@0.1.0-alpha.17

## 0.1.0-alpha.16

### Patch Changes

- Updated dependencies [[`d7f10fe`](https://github.com/mike-north/formspec/commit/d7f10fe7d3d855a99423baec3996bebd47f80190), [`2acf352`](https://github.com/mike-north/formspec/commit/2acf3529a93ad70801073503c13e505ccef8a23b), [`889470b`](https://github.com/mike-north/formspec/commit/889470b4b3ab9d4bf9ed72169e083a2887256f57), [`271071e`](https://github.com/mike-north/formspec/commit/271071ed46833db97a81407557ad5c52e697b8b0), [`111c021`](https://github.com/mike-north/formspec/commit/111c021c13a4468a57d0c2291ff3aa77133117a0), [`6276145`](https://github.com/mike-north/formspec/commit/6276145056bf1510b9ea785a22e1503ec2a658f7)]:
  - @formspec/core@0.1.0-alpha.16
  - @formspec/build@0.1.0-alpha.16
  - @formspec/constraints@0.1.0-alpha.16
  - @formspec/dsl@0.1.0-alpha.16
  - @formspec/eslint-plugin@0.1.0-alpha.16

## 0.1.0-alpha.15

### Patch Changes

- Updated dependencies [[`e72c621`](https://github.com/mike-north/formspec/commit/e72c621781af2f71e1b51b168f1f6c9dc7b40195), [`568f7e5`](https://github.com/mike-north/formspec/commit/568f7e5db40d2606ecbf0e535212e0f0973c5036), [`ac69f33`](https://github.com/mike-north/formspec/commit/ac69f3376f1d5b8193b79a20d023b13e5ca82a8c), [`0526742`](https://github.com/mike-north/formspec/commit/0526742817ef372e968b582d579bc79fdf9f17aa), [`3cf95b1`](https://github.com/mike-north/formspec/commit/3cf95b120cbf04a1f443f1b825682383f7da6d14), [`6b0930e`](https://github.com/mike-north/formspec/commit/6b0930ee43131c10d48222ccdd687746a252b505), [`5752b5c`](https://github.com/mike-north/formspec/commit/5752b5c3d77f0cd1a2183a0794ce5889702cb9f2)]:
  - @formspec/build@0.1.0-alpha.15

## 0.1.0-alpha.14

### Patch Changes

- Updated dependencies [[`ed89d72`](https://github.com/mike-north/formspec/commit/ed89d72863ad475e811d0d9c0c406816d65fda6d), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec), [`61c320c`](https://github.com/mike-north/formspec/commit/61c320c53471e8f7fecdbd240517943e068decec)]:
  - @formspec/build@0.1.0-alpha.14
  - @formspec/eslint-plugin@0.1.0-alpha.14
  - @formspec/core@0.1.0-alpha.14
  - @formspec/constraints@0.1.0-alpha.14
  - @formspec/dsl@0.1.0-alpha.14

## 0.1.0-alpha.13

### Patch Changes

- Updated dependencies [[`bc76a57`](https://github.com/mike-north/formspec/commit/bc76a57ffe1934c485aec0c9e1143cc5203c429c)]:
  - @formspec/core@0.1.0-alpha.13
  - @formspec/build@0.1.0-alpha.13
  - @formspec/constraints@0.1.0-alpha.13
  - @formspec/dsl@0.1.0-alpha.13
  - @formspec/eslint-plugin@0.1.0-alpha.13

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
  - @formspec/eslint-plugin@0.1.0-alpha.12
  - @formspec/constraints@0.1.0-alpha.12
  - @formspec/dsl@0.1.0-alpha.12

## 0.1.0-alpha.11

### Patch Changes

- Updated dependencies [[`e1e734f`](https://github.com/mike-north/formspec/commit/e1e734fff68c5dd899495062f3bf0f52a8954d3b), [`9143266`](https://github.com/mike-north/formspec/commit/9143266fa69ff4bd8f6232c997ce7d2d070bef4e)]:
  - @formspec/core@0.1.0-alpha.11
  - @formspec/dsl@0.1.0-alpha.11
  - @formspec/build@0.1.0-alpha.11
  - @formspec/constraints@0.1.0-alpha.11
  - @formspec/eslint-plugin@0.1.0-alpha.11

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [[`15519c3`](https://github.com/mike-north/formspec/commit/15519c393904ed73748f3de8dd1a07b28cfdcf41)]:
  - @formspec/build@0.1.0-alpha.10
  - @formspec/core@0.1.0-alpha.10
  - @formspec/constraints@0.1.0-alpha.10
  - @formspec/dsl@0.1.0-alpha.10
  - @formspec/eslint-plugin@0.1.0-alpha.10

## 0.1.0-alpha.9

### Patch Changes

- Updated dependencies [[`f598436`](https://github.com/mike-north/formspec/commit/f598436187e881d777259e794005bb4980abca21)]:
  - @formspec/core@0.1.0-alpha.9
  - @formspec/build@0.1.0-alpha.9
  - @formspec/eslint-plugin@0.1.0-alpha.9
  - @formspec/constraints@0.1.0-alpha.9
  - @formspec/dsl@0.1.0-alpha.9

## 0.1.0-alpha.8

### Patch Changes

- Updated dependencies [[`01ec074`](https://github.com/mike-north/formspec/commit/01ec07475f99eabb721d71baf9ab3fca6e721b98)]:
  - @formspec/build@0.1.0-alpha.8
  - @formspec/dsl@0.1.0-alpha.8
  - @formspec/eslint-plugin@0.1.0-alpha.8
  - @formspec/constraints@0.1.0-alpha.7

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

### Patch Changes

- Updated dependencies [[`5c3cdbf`](https://github.com/mike-north/formspec/commit/5c3cdbfbb6c10ce80722917decd8d16f496e3202), [`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f), [`5c3cdbf`](https://github.com/mike-north/formspec/commit/5c3cdbfbb6c10ce80722917decd8d16f496e3202)]:
  - @formspec/constraints@0.1.0-alpha.7
  - @formspec/eslint-plugin@0.1.0-alpha.7
  - @formspec/build@0.1.0-alpha.7
