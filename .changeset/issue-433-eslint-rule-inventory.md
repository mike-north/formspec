---
"@formspec/eslint-plugin": minor
---

Reconcile the public ESLint rule inventory with the tooling spec.

- Add canonical rule IDs `formspec/documentation/no-unsupported-description-tag`, `formspec/dsl-policy/allowed-field-types`, and `formspec/dsl-policy/allowed-layouts`.
- Keep `formspec/constraint-validation/no-description-tag`, `formspec/constraints-allowed-field-types`, and `formspec/constraints-allowed-layouts` as deprecated aliases for existing ESLint configs.
- Enable `formspec/tag-recognition/no-markdown-formatting` as a warning in `recommended` and an error in `strict`, and enable the DSL-policy rules in both presets.
