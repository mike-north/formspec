---
"@formspec/config": patch
"@formspec/cli": patch
"@formspec/build": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

Fix `enumSerialization` handling after the smart-size release by validating malformed per-package overrides in `formspec.config.*` files and by making the CLI honor package-scoped `enumSerialization` overrides when generating schemas. `@formspec/build` no longer constructs an empty extension registry when a caller passes a config with `extensions: []`, so a resolved config can be handed to schema generation without paying for registry setup that was never configured.
