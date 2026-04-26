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
- `loadConfig` — deprecated; new code calls `loadFormSpecConfig`.
- `.formspec.yml` — legacy; current convention is `formspec.config.ts` (or `.mts`/`.js`/`.mjs`).

## Architectural principles to enforce

- **A1 / A3 / A5** — Generators consume the IR (never chain DSL or AST). Generation is a pure function of the IR (no ambient state). Pipeline phases run in order (Parse → Analyze → Canonicalize → Validate → Generate); no phase reaches back.
- **S1** — Constraints narrow; never broaden.
- **S3** — Every IR-level constraint and annotation carries `Provenance`. Flag new IR-construction sites that omit it.
- **S4** — Type determines applicable constraints. `@minLength` on a number field is a static error, not a runtime no-op.
- **C1** — Constraints compose by intersection; annotations compose by override (closest-to-use wins). New metadata must declare its kind.
- **C2 / C3** — `Group` does not alter schema shape; `when()` does not remove fields from the JSON Schema.
- **E3** — Extension JSON Schema keywords use the configurable vendor prefix. Flag hard-coded `"x-formspec-…"` literals in extension code.
- **PP4** — No runtime reflection for schema generation. Metadata extraction is static (TypeScript Compiler API at build time).

## Test discipline

- Bug fixes require a regression test that fails pre-fix and references the bug (issue number or summary) in its name or comment.
- Spec-first: expected IR/schema values are hand-derived from the spec/design doc and cite the section (e.g., `// per design 003 §2.3`). Exemplars: `packages/build/tests/parity/` (hand-written `expected-ir.ts` constants) and `packages/build/tests/ir-json-schema-generator.test.ts`. Flag `toMatchSnapshot()` / `loadExpected()` as the only correctness mechanism — tautological.
- Pick the test layer deliberately: unit for pure logic; integration when a change crosses a package boundary declared in `formspec.cml`; e2e for multi-context flows; UAT (CLI subprocess) for user-visible CLI output.
- `tsd` type tests need positive (`expectType` / `expectAssignable`) and negative (`expectError`) cases.
- Deterministic time: fixed date constants or `vi.useFakeTimers()`; never `new Date()` / `Date.now()` in fixtures.
- If a unit test mocks a dependency, an integration test must exercise the real one somewhere.

## Out of scope (do not flag)

- TypeScript 6.x matrix CI failures — pre-existing, handled separately.
- Stale `@formspec/playground` references in older docs — separate cleanup PR.
