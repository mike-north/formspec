---
"@formspec/constraints": minor
"@formspec/eslint-plugin": minor
---

Add @formspec/constraints package for defining and enforcing DSL constraints

**@formspec/constraints:**
- New package for constraining which FormSpec DSL features are allowed
- Configure via `.formspec.yml` with field types, layout, and field option constraints
- Severity levels: `error`, `warn`, `off`
- Programmatic API for loading config and validating FormSpec definitions
- JSON Schema for editor autocompletion

**@formspec/eslint-plugin:**
- New `constraints-allowed-field-types` rule
- New `constraints-allowed-layouts` rule
- Rules automatically load constraints from `.formspec.yml`
