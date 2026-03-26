# Execution Board

## Current State

- Post-merge stabilization is complete on `main`.
- The full workspace acceptance suite passes on a fresh `main` worktree:
  - `pnpm run build`
  - `pnpm run test`
  - `pnpm run lint`
  - `pnpm run typecheck`
  - `pnpm run api-extractor`
- The skip inventory is empty:
  - no `it.skip(...)`
  - no `describe.skip(...)`
  - no `test.skip(...)`
  - no `skipIf(...)`
  - no `BUG:` markers in active test code

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
- `#102` Cross-axis conditional rule flattening
- `#104` Mixed-authoring overlays
- `#105` Recursive circular-reference support

## Integration-Ready Surfaces

- `buildMixedAuthoringSchemas(...)`
- recursive named-type emission in canonical IR and JSON Schema via recursive `$defs` / `$ref`
- flattened cross-axis JSON Forms rule generation
- public extension/runtime generation surfaces landed in the readiness wave

## Next Focus

- start real downstream integration against `main`
- treat integration bugs as the next highest-priority work
- avoid speculative surface expansion until integration exposes a concrete gap

## Notes

- `#94` appears complete in the codebase: no `loadExpected`, no `e2e/expected`, and no gold-master test infrastructure remain outside historical documentation references.
- Release-related changeset parsing issues were repaired in `#126`, and release `0.1.0-alpha.15` has already been cut successfully.
