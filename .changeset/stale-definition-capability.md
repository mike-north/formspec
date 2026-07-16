---
"@formspec/language-server": minor
---

Stop advertising `definitionProvider: true` in the language server's initialize capabilities. The handler was a hard-coded `return null` stub, so a standalone-LSP editor with no co-resident TypeScript service always got "No definition found" for go-to-definition instead of falling through to another provider — the server was misrepresenting a capability it didn't implement.

Per docs/004-tooling.md §5.4, `{@link}` navigation for FormSpec condition types is already handled by the TypeScript language service itself; this server has no additional go-to-definition work to do. The `onDefinition` registration and the stub `getDefinition()` provider (previously exported from the package root) are removed.

This is a breaking change to the public API surface (`getDefinition` is no longer exported), landed without a deprecation period per PP14's alpha-churn exception: the package is pre-1.0 (`0.1.0-alpha.x`), and the removed function only ever returned `null`, so no consumer could have depended on real behavior from it.
