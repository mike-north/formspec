---
"@formspec/build": patch
"@formspec/cli": patch
"formspec": patch
---

Support mapped and referenced object-like type aliases through the public schema generation entry points.

- `@formspec/build` now generates schemas for object-like utility aliases such as `Partial<T>`, `Pick<T, ...>`, and intersections that add inline members.
- Invalid callable intersections and duplicate-property alias merges continue to be rejected.
