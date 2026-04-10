---
"@formspec/build": minor
"@formspec/cli": patch
"formspec": patch
---

Add `resolveDeclarationMetadata()` to the static build workflow so consumers can resolve method-, field-, and type-level metadata from declarations using FormSpec's active metadata policy. This makes method-level `@apiName` and `@displayName` resolution available alongside existing parameter and return-type schema generation helpers.
