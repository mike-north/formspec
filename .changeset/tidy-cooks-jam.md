---
"@formspec/build": patch
"@formspec/cli": patch
"formspec": patch
---

Fix discriminator specialization for imported generic type aliases that carry
`@discriminator` across module boundaries.

- `@formspec/build` now resolves imported type aliases through TypeScript import
  alias symbols before unwrapping object-like alias bodies, so imported
  `Ref<T>`-style aliases specialize the same way as local aliases.
- Added regression coverage for local vs imported generic aliases with matching
  discriminator behavior, including metadata-derived fallback and
  `discriminator.apiNamePrefix`.
