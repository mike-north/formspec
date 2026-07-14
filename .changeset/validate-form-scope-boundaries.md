---
"@formspec/dsl": patch
"formspec": patch
---

Fix `validateForm` false positive: field names reused across an object/array scope boundary (e.g. a top-level `id` alongside a nested `user.id`) are no longer reported as duplicates. `field.object()` properties and `field.array()` items each form their own schema scope; duplicate detection is now scoped accordingly, while duplicates within the same scope (including inside groups and conditionals, which stay flat) still report as errors.
