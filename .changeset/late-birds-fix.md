---
"@formspec/config": patch
"@formspec/cli": patch
---

Fix `enumSerialization` handling after the smart-size release by validating malformed per-package overrides in `formspec.config.*` files and by making the CLI honor package-scoped `enumSerialization` overrides when generating schemas.
