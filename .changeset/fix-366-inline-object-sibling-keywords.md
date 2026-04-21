---
"@formspec/build": patch
"formspec": patch
---

Fix path-targeted constraints on missing properties of inline object schemas emitting unnecessary `allOf` wrappers (issue #366).

When a path-targeted constraint targets a property that is absent from an inline object schema and `additionalProperties` is not `false`, the override is now merged directly into `properties` — producing a flat `{ type: "object", properties: { ...existing, newProp: ... } }` with no `allOf`. When `additionalProperties` is `false`, the previous `allOf` composition is retained to avoid inadvertently widening the closed schema.
