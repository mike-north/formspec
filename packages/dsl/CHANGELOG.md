# @formspec/dsl

## 0.1.0-alpha.0

### Minor Changes

- [#1](https://github.com/mike-north/formspec/pull/1) [`7a42311`](https://github.com/mike-north/formspec/commit/7a423116ca507f9a52dda94ba1238bf7bdb2b949) Thanks [@mike-north](https://github.com/mike-north)! - Add `is()` predicate helper and update `when()` API for better readability

  The `when()` function now accepts a predicate created with `is()` instead of separate field/value arguments:

  ```typescript
  // Before (confusing):
  when("paymentMethod", "card", ...)

  // After (clear):
  when(is("paymentMethod", "card"), ...)
  ```

  This makes the conditional logic much more readable and self-documenting.

  ### New exports
  - `is(fieldName, value)` - Creates an equality predicate
  - `EqualsPredicate` type - Type for equality predicates
  - `Predicate` type - Union of all predicate types

  ### Breaking changes

  The `when()` function signature has changed from `when(fieldName, value, ...elements)` to `when(predicate, ...elements)`. Update all usages to use the `is()` helper.

### Patch Changes

- Updated dependencies [[`7a42311`](https://github.com/mike-north/formspec/commit/7a423116ca507f9a52dda94ba1238bf7bdb2b949)]:
  - @formspec/core@0.1.0-alpha.0
