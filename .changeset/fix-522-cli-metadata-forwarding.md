---
"@formspec/cli": patch
---

Fix `formspec generate` dropping a project's `config.metadata` naming-inference policy (apiName/displayName/pluralization) for chain-DSL FormSpec exports — including when `config.serialization` is also set — and for class-based generation via `generateClassSchemas`. Class-based generation also now honors `config.vendorPrefix` and `config.serialization`, which were previously ignored on that path while chain-DSL exports applied them. Both authoring surfaces now produce identically-inferred names under the same config.

Known limitation: method schemas (`generateMethodSchemas`) do not yet apply the metadata policy — the method-schema path builds its IR without a canonicalization step that accepts one. Tracked separately.
