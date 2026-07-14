---
"@formspec/dsl": patch
"@formspec/dsl-policy": patch
"formspec": patch
---

Harden two input trust boundaries. `field.enum` now rejects `null` and array entries in object-style options arrays with the same friendly `field.enum(...): object options must have string "id" and "label"` error instead of crashing with a raw `TypeError`. `mergeWithDefaults(undefined)` now returns an independent, freshly-built policy object on every call instead of the shared module-level `DEFAULT_DSL_POLICY` reference, so mutating one caller's resolved policy can no longer corrupt the default for subsequent callers.
