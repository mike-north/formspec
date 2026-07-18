---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/core": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"@formspec/validator": patch
"formspec": patch
---

Add `repository` metadata (`url` + package `directory`) to every published
package's package.json, as required for npm trusted publishing (OIDC) and
provenance attestation. Releases now authenticate via GitHub's OIDC token
exchange instead of a long-lived `NPM_TOKEN` secret. No runtime behavior
changes.
