# @formspec/language-server

## 0.1.0-alpha.20

### Minor Changes

- [#163](https://github.com/mike-north/formspec/pull/163) [`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34) Thanks [@mike-north](https://github.com/mike-north)! - Add semantic comment cursor analysis for FormSpec tags, including richer hover
  content and target-specifier completions for language-server consumers.

- [#166](https://github.com/mike-north/formspec/pull/166) [`8b287fb`](https://github.com/mike-north/formspec/commit/8b287fbadf24b7e1a71ae94fb0ce982849f8888c) Thanks [@mike-north](https://github.com/mike-north)! - Add the hybrid FormSpec editor architecture built around a tsserver plugin and a lightweight language server.
  - `@formspec/analysis` now exports the serializable protocol, manifest helpers, and file-snapshot data model used across the plugin/LSP boundary.
  - `@formspec/language-server` can enrich hover and completion results over the local plugin transport while degrading cleanly to syntax-only behavior.
  - `@formspec/ts-plugin` provides the TypeScript language service plugin that owns semantic analysis, workspace manifest publishing, and local IPC responses.

### Patch Changes

- [#165](https://github.com/mike-north/formspec/pull/165) [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d) Thanks [@mike-north](https://github.com/mike-north)! - Integrate compiler-backed comment tag validation into shared analysis and build extraction.

- [#164](https://github.com/mike-north/formspec/pull/164) [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef) Thanks [@mike-north](https://github.com/mike-north)! - Add compiler-backed synthetic tag signature scaffolding for shared FormSpec comment analysis.

- [#161](https://github.com/mike-north/formspec/pull/161) [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95) Thanks [@mike-north](https://github.com/mike-north)! - Centralize FormSpec comment tag analysis and fix shared registry regressions across build, lint, and language-server tooling.

- Updated dependencies [[`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34), [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d), [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef), [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95), [`8b287fb`](https://github.com/mike-north/formspec/commit/8b287fbadf24b7e1a71ae94fb0ce982849f8888c)]:
  - @formspec/analysis@0.1.0-alpha.20

## 0.1.0-alpha.19

### Patch Changes

- Updated dependencies [[`1df7e34`](https://github.com/mike-north/formspec/commit/1df7e343b4fc17746c9a624ac5339db0071bc187)]:
  - @formspec/core@0.1.0-alpha.19

## 0.1.0-alpha.17

### Minor Changes

- [#136](https://github.com/mike-north/formspec/pull/136) [`dbc6c21`](https://github.com/mike-north/formspec/commit/dbc6c219be95d9481afa9936eb3b81c7f446fb65) Thanks [@mike-north](https://github.com/mike-north)! - Add extension-defined TSDoc constraint tags and built-in constraint broadening for custom types through the public FormSpec extension surface.

  This also fixes the extension integration path so class and interface schema generation can resolve registered custom source types, parse extension tags alongside built-in tags in the same TSDoc block, validate extension-defined narrowing and contradiction semantics, and emit stable JSON Schema plus JSON Forms output without adding Decimal-specific branches to FormSpec internals.

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

### Minor Changes

- [#64](https://github.com/mike-north/formspec/pull/64) [`42303a2`](https://github.com/mike-north/formspec/commit/42303a2e6b0f77b2db1b222df4240866cf0f1492) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/language-server package — LSP implementation providing completions, hover, and go-to-definition for JSDoc constraint tags (`@Minimum`, `@Maximum`, `@Pattern`, etc.) in TypeScript files using FormSpec decorators.

### Patch Changes

- Updated dependencies [[`4d1b327`](https://github.com/mike-north/formspec/commit/4d1b327b420f52115bcd66367ee901a23b371890)]:
  - @formspec/core@0.1.0-alpha.12
