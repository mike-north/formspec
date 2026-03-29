# @formspec/ts-plugin

## 0.1.0-alpha.20

### Minor Changes

- [#166](https://github.com/mike-north/formspec/pull/166) [`8b287fb`](https://github.com/mike-north/formspec/commit/8b287fbadf24b7e1a71ae94fb0ce982849f8888c) Thanks [@mike-north](https://github.com/mike-north)! - Add the hybrid FormSpec editor architecture built around a tsserver plugin and a lightweight language server.
  - `@formspec/analysis` now exports the serializable protocol, manifest helpers, and file-snapshot data model used across the plugin/LSP boundary.
  - `@formspec/language-server` can enrich hover and completion results over the local plugin transport while degrading cleanly to syntax-only behavior.
  - `@formspec/ts-plugin` provides the TypeScript language service plugin that owns semantic analysis, workspace manifest publishing, and local IPC responses.

### Patch Changes

- Updated dependencies [[`816b25b`](https://github.com/mike-north/formspec/commit/816b25b839821aaba74c18ac220a11f199255d34), [`3db2dc7`](https://github.com/mike-north/formspec/commit/3db2dc7672bb8a8705af6af68fb874026538f48d), [`17a0c90`](https://github.com/mike-north/formspec/commit/17a0c90a9130ed526d25ff09b8fc2a6c3b774fef), [`3eafa7e`](https://github.com/mike-north/formspec/commit/3eafa7e918577605053b8f2c46a7c81c5c16bf95), [`8b287fb`](https://github.com/mike-north/formspec/commit/8b287fbadf24b7e1a71ae94fb0ce982849f8888c)]:
  - @formspec/analysis@0.1.0-alpha.20
