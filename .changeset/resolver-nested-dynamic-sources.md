---
"@formspec/runtime": patch
"formspec": patch
---

Fix resolver source extraction to recurse into array items and object properties

`defineResolvers` now detects `field.dynamicEnum()` sources nested inside
`field.array()` items and `field.object()` properties, at any depth. Previously
both the type-level `ExtractDynamicSources` and the runtime `extractSources`
walker only descended into groups and conditionals, so a dynamic enum nested in
an array or object was invisible: no resolver was required at the type level, no
construction-time "Missing resolver" warning fired, and the failure surfaced
only as a runtime throw when the resolver was requested.

The resolver map argument to `defineResolvers` is now pinned to the
form-derived source union, so omitting a required resolver (e.g.
`defineResolvers(form, {})` for a form with an unresolved dynamic enum) is a
type error rather than silently accepted.
