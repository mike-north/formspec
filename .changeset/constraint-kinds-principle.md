---
"@formspec/config": patch
---

Reconcile `@formspec/config` documentation with its unified-configuration identity (resolves [#419](https://github.com/mike-north/formspec/issues/419) — documentation half).

The package JSDoc on `packages/config/src/index.ts` now describes `@formspec/config` as the unified configuration package (schemas, extensions, serialization, metadata policy, pipeline settings) and acknowledges that DSL-policy validation lives here transitionally pending the factoring tracked in [#420](https://github.com/mike-north/formspec/issues/420). The `package.json` description is updated to mention DSL-policy validation explicitly. No source-code or runtime behavior changes.
