---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/dsl": minor
"formspec": minor
---

Add configurable enum JSON Schema serialization and enum-member display-name policy support.

- Default labeled enum output to flat `enum` plus a complete `x-<vendor>-display-names` extension
- Add opt-in `oneOf` enum serialization with `const`/`title` branches
- Add `metadata.enumMember.displayName` policy configuration for inferred or required enum-member labels
- Add `--enum-serialization <enum|oneOf>` to the published CLIs
- Re-export the new enum-member metadata policy types from `@formspec/core`, `@formspec/dsl`, and `formspec`
