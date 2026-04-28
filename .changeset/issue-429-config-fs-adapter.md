---
"@formspec/config": minor
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

Align configuration loading with issue #429 by removing legacy YAML/browser-only surfaces and introducing a filesystem adapter for config discovery.

### `@formspec/config`

- Added `FileSystem` and `LoadConfigOptions.fileSystem` so non-Node consumers can supply path, existence, and file-read operations while `loadFormSpecConfig` lazily loads Node defaults.
- Removed `@formspec/config/browser` and removed `loadConfigFromString`.
- Removed `./formspec.schema.json` package export and deleted the shipped schema file.
- Removed the `yaml` dependency.

### Downstream packages

- Re-release packages that depend on `@formspec/config` so their published dependency graph reflects the unified config surface.
