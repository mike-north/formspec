---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Add dedicated regression coverage for issue #366 — path-targeted constraints on missing properties of inline object schemas now consistently emit a flat `{ type: "object", properties: { ...existing, newProp: ... } }` with no `allOf` wrapper, including when the base is closed (`additionalProperties: false`). The emission-policy change itself was made in the broader #382 Site 1 fix; this adds spec-grounded tests covering nested paths, array-wrapped inline objects, and nullable-union branches.
