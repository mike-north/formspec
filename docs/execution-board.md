# Execution Board

## Current State

- Non-deferred skip burn-down is complete on `main`.
- The only remaining skipped test is tied to deferred feature issue `#105` (circular references).
- The next deferred-feature implementation order is:
  1. `#104` mixed-authoring overlays
  2. `#105` circular references
  3. `#102` cross-axis conditional rules

## Recently Completed

- `#25` Add dry-run mode to CLI
- `#26` Standardize CLI output on JSON Forms naming
- `#88` TypeScript edge-case coverage
- `#90` UI Schema completeness coverage
- `#91` Public extension runtime support
- `#92` Diagnostic quality and semantic error-code coverage
- `#93` CLI behavioral coverage
- `#100` Remove legacy `@Field_*` tag support
- `#128` Annotation and metadata emission fixes
- `#129` Constraint and literal emission fixes
- `#130` Diagnostics and CLI harness cleanup

## Remaining Deferred Feature Work

- `#104` Support mixed-authoring forms with ChainDSL overlays on TSDoc data models
- `#105` Support circular references in canonical IR and JSON Schema emission
- `#102` Support cross-axis conditional rules beyond JSON Forms single-rule limitation

## Notes

- `#94` appears complete in the codebase: no `loadExpected`, no `e2e/expected`, and no gold-master test infrastructure remain outside historical documentation references.
- Release-related changeset parsing issues were repaired in `#126`, and release `0.1.0-alpha.15` has already been cut successfully.
