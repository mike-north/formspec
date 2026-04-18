---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Improve `TYPE_MISMATCH` diagnostics: when a constraint like `@exclusiveMinimum` is applied to an object field whose type contains a subfield that satisfies the constraint's required capability, the error now includes a `Hint:` showing the corrected path-targeted syntax (e.g., `@exclusiveMinimum :value 0`). When multiple subfields qualify, the hint lists them.
