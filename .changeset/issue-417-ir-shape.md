---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/core": minor
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Reconcile the Canonical IR object and enum-member shapes with spec 001 decisions for issue #417 PR-A.

`EnumMember.displayName` is now `EnumMember.label` with no deprecated alias because the package is still alpha. `ObjectTypeNode.additionalProperties` now distinguishes omitted policy-defaulted objects from explicit `true`, explicit `false`, and TypeNode-constrained additional values. `ObjectTypeNode.passthrough` is now available for the future `passthroughObject` policy keyword emission path.

The JSON Schema emitter now handles all `additionalProperties` arms and preserves the `passthrough` bit as a no-op until #416 PR-2 wires keyword emission.
