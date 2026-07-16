---
"@formspec/ts-plugin": patch
"@formspec/language-server": patch
---

Fix two integration-fidelity gaps between the FormSpec TypeScript plugin and its hosts.

**@formspec/ts-plugin:**

- The language-service proxy now forwards every argument to the wrapped
  TypeScript methods verbatim. Previously the `getCompletionsAtPosition`
  wrapper dropped TypeScript's fourth `formattingSettings` argument, discarding
  format context that governs completion insert text.

**@formspec/language-server:**

- Manifest discovery now walks from a document's directory upward to the
  matching editor workspace root, so the language server finds the plugin
  manifest even when the plugin advertises it under a nested package's tsconfig
  project directory (the common monorepo-opened-at-root case). The walk is
  bounded by the workspace root, so manifests outside the editor's workspace are
  never read.
