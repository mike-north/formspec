---
"@formspec/eslint-plugin": patch
---

Align `@formspec/eslint-plugin` tag applicability checks with `@formspec/analysis` semantic capabilities, so built-in tags classify branded primitive intersections consistently. Numeric constraint tags such as `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, and `@multipleOf` now accept branded numeric aliases like `Integer`, `PositiveInteger`, and branded `bigint` types without false-positive type-mismatch errors, while incorrect cross-kind usages still report mismatches.
