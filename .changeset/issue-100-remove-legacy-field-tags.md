"@formspec/build": minor
"@formspec/cli": minor
---

Remove legacy `@Field_displayName` and `@Field_description` support in favor of canonical `@displayName` and `@description` tags.

This is a breaking change for schemas that still use the legacy `@Field_displayName` and `@Field_description` tags.
