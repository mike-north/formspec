---
"@formspec/analysis": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
---

Add the hybrid FormSpec editor architecture built around a tsserver plugin and a lightweight language server.

- `@formspec/analysis` now exports the serializable protocol, manifest helpers, and file-snapshot data model used across the plugin/LSP boundary.
- `@formspec/language-server` can enrich hover and completion results over the local plugin transport while degrading cleanly to syntax-only behavior.
- `@formspec/ts-plugin` provides the TypeScript language service plugin that owns semantic analysis, workspace manifest publishing, and local IPC responses.
