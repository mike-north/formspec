---
"@formspec/constraints": patch
---

Fix type errors and improve test coverage in constraints package

- Fix `extractFieldOptions` to correctly map `min`/`max` properties from `NumberField` to `minValue`/`maxValue` constraints
- Add missing `custom` property to `DEFAULT_CONSTRAINTS.controlOptions`
- Fix ESLint violations (nullish coalescing, unnecessary conditionals, template expressions)
- Add comprehensive tests for helper functions: `isFieldTypeAllowed`, `getFieldTypeSeverity`, `isFieldOptionAllowed`, `getFieldOptionSeverity`, `isLayoutTypeAllowed`, `isNestingDepthAllowed`
- Add tests for `validateFormSpec` wrapper function
- Add edge case tests for empty elements and deeply nested objects
- Increase test count from 35 to 72
