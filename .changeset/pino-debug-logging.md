---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/analysis": minor
"@formspec/runtime": minor
"@formspec/config": minor
"@formspec/cli": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"@formspec/dsl": minor
"@formspec/eslint-plugin": minor
"formspec": minor
---

Add pino-based debug logging with a `DEBUG=formspec:*` enable convention.

Apps (`@formspec/cli`, the `@formspec/build` CLI, and `@formspec/language-server`) construct pino loggers inline and route output to stderr, stderr, and the LSP connection console respectively. `@formspec/ts-plugin` wraps `ts.server.Logger` via `fromTsLogger` so diagnostics flow through the tsserver log file instead of stdio.

Libraries (`@formspec/build`, `@formspec/analysis`, `@formspec/runtime`, `@formspec/config`) now accept an optional `logger?: LoggerLike` on their public entry points, defaulting to a silent no-op. They never import pino directly, so consumers do not pick up pino as a transitive dependency.

`@formspec/core` exports the shared `LoggerLike` interface, `noopLogger` constant, and the `isNamespaceEnabled` matcher used across all apps. The umbrella `formspec` package re-exports `LoggerLike` and `noopLogger`.
