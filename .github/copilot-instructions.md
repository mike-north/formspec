# FormSpec Code Review Guidance

Cite these by name when relevant:

- `formspec.cml` — formal Context Mapper Language model. 12 bounded contexts and the relationships between them. Authoritative.
- `BOUNDED_CONTEXTS.md` — prose companion to the CML.
- `GLOSSARY.md` — project vocabulary.
- `docs/000-principles.md` — architectural principles (referenced by ID below).

## Bounded contexts and import discipline

Every cross-package import must correspond to a relationship declared in `formspec.cml`. Flag:

- `from "@formspec/<x>/src/..."` — never import another package's source path.
- `from "@formspec/<x>/dist/..."` — never import another package's build output.
- Relative imports that cross a package boundary.
- Imports of subpaths not in the upstream package's `exports`. Canonical subpaths are `.`, `/internals`, `/browser`, `/protocol`.

Each concept has exactly one owning bounded context. Adding constraint extraction in `@formspec/dsl` instead of `@formspec/build`, or putting tag-parsing in `@formspec/core` instead of `@formspec/analysis`, is wrong by definition — flag it.

## Vocabulary

Use canonical terms from `GLOSSARY.md` verbatim. Common drifts to flag:

- `@formspec/constraints` — does not exist; use `@formspec/config`.
- "JSDoc constraint" where "TSDoc tag" is meant.
- "Resolver" used for the underlying data store (use "Data Source").
- `loadConfig` — deprecated; new code calls `loadFormSpecConfig`.
- `.formspec.yml` — legacy; current convention is `formspec.config.ts` (or `.mts`/`.js`/`.mjs`).
- Inventing a third name for `FormIR` / "Canonical IR" — both existing names are fine in their context.

## Architectural principles to enforce

- **A1** — Generators consume the IR, never the chain DSL value or the TypeScript AST directly.
- **A3** — Generation is a pure function of the IR. No ambient module state; no side-effecting config loading inside generators.
- **A5** — Pipeline phases run in order (Parse → Analyze → Canonicalize → Validate → Generate). No phase reaches back into an earlier phase's data.
- **S1** — Constraints narrow; never broaden. A change that lets a constraint relax a previously narrowed set is a bug.
- **S3** — Every IR-level constraint and annotation carries `Provenance`. Flag new IR-construction sites that omit it.
- **S4** — Type determines applicable constraints. `@minLength` on a number field is a static error, not a runtime no-op.
- **C1** — Constraints compose by intersection; annotations compose by override (closest-to-use wins). New metadata must declare its kind.
- **C2 / C3** — `Group` does not alter schema shape; `when()` does not remove fields from the JSON Schema.
- **E3** — Extension JSON Schema keywords use the configurable vendor prefix. Flag hard-coded `"x-formspec-…"` literals in extension code.
- **PP4** — No runtime reflection for schema generation. Metadata extraction is static (TypeScript Compiler API at build time).

## Test discipline

- Bug fixes require a regression test that fails against the pre-fix code.
- Spec-first assertions: flag `toMatchSnapshot()` / `loadExpected()` as the only correctness mechanism — these are tautological. Each assertion should trace to a spec section.
- `tsd` type tests need both positive (`expectType` / `expectAssignable`) and negative (`expectError`) cases.
- Deterministic time: fixed date constants or `vi.useFakeTimers()`; never `new Date()` / `Date.now()` in fixtures.
- If a unit test mocks a dependency, an integration test must exercise the real one somewhere.

## Out of scope (do not flag)

- TypeScript 6.x matrix CI failures — pre-existing, handled separately.
- Stale `@formspec/playground` references in older docs — separate cleanup PR.
