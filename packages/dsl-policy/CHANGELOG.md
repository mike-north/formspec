# @formspec/dsl-policy

## 0.1.0-alpha.70

### Patch Changes

- Updated dependencies [[`f3ddfa6`](https://github.com/mike-north/formspec/commit/f3ddfa6d17a448c393f869d9ef019d4cd70a5905)]:
  - @formspec/core@0.1.0-alpha.70

## 0.1.0-alpha.69

### Patch Changes

- [#584](https://github.com/mike-north/formspec/pull/584) [`384f6d5`](https://github.com/mike-north/formspec/commit/384f6d5bb6ab6a686133c2d012985bd8fd56a014) Thanks [@mike-north](https://github.com/mike-north)! - Harden two input trust boundaries. `field.enum` now rejects `null` and array entries in object-style options arrays with the same friendly `field.enum(...): object options must have string "id" and "label"` error instead of crashing with a raw `TypeError`. `mergeWithDefaults(undefined)` now returns an independent, freshly-built policy object on every call instead of the shared module-level `DEFAULT_DSL_POLICY` reference, so mutating one caller's resolved policy can no longer corrupt the default for subsequent callers.

- Updated dependencies [[`0af5fb5`](https://github.com/mike-north/formspec/commit/0af5fb59d29d369701b1a3601b69536eb616ad1c)]:
  - @formspec/core@0.1.0-alpha.69

## 0.1.0-alpha.67

### Patch Changes

- Updated dependencies [[`8511aaf`](https://github.com/mike-north/formspec/commit/8511aaf8953bfec00285de44c648fac177de1767), [`3615988`](https://github.com/mike-north/formspec/commit/3615988029c656fa372d860047c16c50553545cf)]:
  - @formspec/core@0.1.0-alpha.67
