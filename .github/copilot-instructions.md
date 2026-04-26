# FormSpec Review Guidance

Authoritative refs (cite when relevant): `formspec.cml`, `BOUNDED_CONTEXTS.md`, `GLOSSARY.md`, `docs/000-principles.md`.

## Imports

- Flag `@formspec/<x>/src/...` or `/dist/...` — bypasses the package barrel.
- Flag relative imports that cross a package boundary.
- Cross-package internal API is declared by `@internal`-tagged barrel exports (API Extractor strips them from public; siblings still import via the main entry). Non-barrel imports are allowed only inside a package's own tests. The only sanctioned subpath is `/browser` for env-conditioned bundles; legacy `/internals`, `/internal`, `/protocol`, `/base` are transitional — do not extend them.
- Every cross-package edge must appear in `formspec.cml`. Each concept has one owning context — constraint extraction belongs in `@formspec/build`, tag parsing in `@formspec/analysis`, IR types in `@formspec/core`.

## Vocabulary drifts to flag

- `@formspec/constraints` → `@formspec/config`.
- "JSDoc constraint" → "TSDoc tag".
- `loadConfig` → `loadFormSpecConfig` (former deprecated).
- `.formspec.yml` → `formspec.config.ts` (former legacy).

## Principles on diffs

- Generators read FormIR only — no chain DSL values, no TypeScript AST, no ambient state, no config loading inside generation. (A1/A3)
- New IR constraint/annotation construction sites must carry `Provenance`. (S3)
- A TSDoc tag misapplied to an incompatible type (e.g., `@minLength` on `number`) is a bug — analysis must reject it as a static error. (S4)
- `Group` does not change schema shape; `when()` does not remove fields from JSON Schema. (C2/C3)
- Extension JSON Schema keywords use the configurable vendor prefix; hardcoded `"x-formspec-…"` literals are wrong. (E3)
- No runtime reflection — no `Reflect.metadata`, no decorators, no `eval`. Metadata extraction is static via the TypeScript Compiler API. (PP4)

## Tests

- Bug fixes need a regression test that fails pre-fix and names the bug.
- Expected IR/schema values are hand-derived from the spec and cite the section (e.g., `// per design 003 §2.3`). See `packages/build/tests/parity/`. `toMatchSnapshot()` / `loadExpected()` as the sole correctness mechanism are tautological — flag.
- Test layer matches the change: unit for pure logic; integration when crossing a CML package boundary; e2e for multi-context flows; UAT (CLI subprocess) for user-visible output.
- `tsd` type tests need positive (`expectType`/`expectAssignable`) and negative (`expectError`) cases.
- Fixed date constants or `vi.useFakeTimers()`. Never `new Date()`/`Date.now()` in fixtures.

## Out of scope

`@formspec/playground` references in older docs — separate cleanup PR.
