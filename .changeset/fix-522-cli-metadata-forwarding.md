---
"@formspec/cli": patch
---

Fix `formspec generate` dropping a project's `config.metadata` naming-inference policy (apiName/displayName/pluralization) for chain-DSL FormSpec exports, and for class-based generation via `generateClassSchemas`/`generateMethodSchemas`. Both authoring surfaces now produce identically-inferred names under the same config.
