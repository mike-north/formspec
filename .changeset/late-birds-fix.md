---
"@formspec/config": patch
"@formspec/cli": patch
"@formspec/build": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

Fix `enumSerialization` handling after the smart-size release by validating malformed per-package overrides in `formspec.config.*` files and by making the CLI honor package-scoped `enumSerialization` overrides when generating schemas. The CLI now passes a merged `FormSpecConfig` (preserving the original `extensions` shape) to schema generation so an empty extension registry is not built on every run when no extensions are configured. `@formspec/config` gains a new `mergePackageOverridesForFile` helper that returns the merged config in its original shape without filling in defaults.
