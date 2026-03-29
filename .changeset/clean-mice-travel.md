---
"@formspec/analysis": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
---

Refine the hybrid editor architecture around the tsserver plugin and lightweight language server.

- `@formspec/analysis` now exposes stable `./protocol` and `./internal` subpaths, keeps the root entrypoint focused on the serialized protocol surface, and hardens protocol validation and synthetic-check caching.
- `@formspec/language-server` now supports env-configured plugin query timeouts and more robust plugin transport fallback behavior.
- `@formspec/ts-plugin` now hardens the local IPC service with socket limits, refactors semantic query handling, and deepens query coverage for diagnostics and file snapshots.
