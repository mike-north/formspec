# FormSpec Bounded Contexts

Reader-friendly companion to [`formspec.cml`](./formspec.cml). The CML file is the source of truth — this document is the hand-maintained prose summary for readers who don't know Context Mapper Language.

> **Keep in sync.** When you add or rename a bounded context, change a relationship, or change a context's responsibilities, update both `formspec.cml` and this document in the same PR.

For project vocabulary, see [`GLOSSARY.md`](./GLOSSARY.md). For the architectural principles those contexts collectively satisfy, see [`docs/000-principles.md`](./docs/000-principles.md).

---

## Why bounded contexts?

If you have a Domain-Driven Design background, skip to "Subdomains at a glance" below. Otherwise, the working definitions:

- A **bounded context** is a part of the system inside which a particular domain language is internally consistent. In FormSpec, each production npm package sits inside exactly one bounded context.
- A **subdomain** is a coarser grouping: several bounded contexts can realize the same subdomain when they collaborate on the same problem area.
- The **context map** declares the relationships between bounded contexts. The notation (`OHS`, `PL`, `CF`, `ACL`) is explained in the "Context map at a glance" section below; you don't need to memorize it before reading the rest of this document.

Naming the contexts explicitly does three things:

1. **Helps contributors find where to make a change.** Every concept (Field, Constraint, Resolver, ...) has a single owning context — see [`GLOSSARY.md`](./GLOSSARY.md).
2. **Makes inter-package contracts deliberate.** A change to a context's public surface is a contract change with downstream consequences; the context map names every such contract.
3. **Enables CI guardrails.** A future check (planned for Phase 2 of the DDD-alignment campaign) parses `formspec.cml` and rejects any cross-package import not permitted by the context map.

The campaign deliberately stops at the strategic level (BoundedContexts + ContextMap). Tactical DDD modeling (Aggregates, Entities, Value Objects) is not in scope today.

---

## Subdomains at a glance

| Subdomain                | Type       | What it is                                                                                                     |
| ------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `FormSpecModelDomain`    | CORE       | The canonical FormIR vocabulary every other context shares                                                     |
| `AuthoringDomain`        | CORE       | The two surfaces developers use to express form definitions                                                    |
| `SemanticAnalysisDomain` | SUPPORTING | Static extraction of FormSpec semantics from TypeScript source — packaged for reuse by Compilation and tooling |
| `CompilationDomain`      | CORE       | Canonicalization plus JSON Schema and UI Schema emission                                                       |
| `ConfigurationDomain`    | SUPPORTING | `formspec.config.ts` loading and DSL capability restriction                                                    |
| `RuntimeDomain`          | SUPPORTING | Resolver helpers for dynamic data at form-render time                                                          |
| `DeveloperToolingDomain` | SUPPORTING | IDE, lint, and CLI integrations                                                                                |
| `ValidationDomain`       | GENERIC    | Standard JSON Schema 2020-12 validation (conforms to an external standard, not to FormSpec specifics)          |

CORE is where FormSpec's distinctive value lives. SUPPORTING domains are necessary but not what makes FormSpec FormSpec. GENERIC means an off-the-shelf solution works — for FormSpec, that's standard JSON Schema validation.

---

## Bounded contexts

Each row below maps a CML `BoundedContext` to its npm package and primary responsibilities. Cell labels match the identifiers in [`formspec.cml`](./formspec.cml) — search there for the full vision statement.

| Bounded context         | Package                     | Subdomain                | Role / responsibilities                                                                                                                               |
| ----------------------- | --------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DomainModelContext`    | `@formspec/core`            | `FormSpecModelDomain`    | Defines and publishes the canonical FormIR. Discriminated FormElement union, IR node types, constraint/annotation registration APIs.                  |
| `ChainDslContext`       | `@formspec/dsl`             | `AuthoringDomain`        | Fluent builder API: `field.*`, `group`, `when`, `formspec`. Full type inference of the resulting schema.                                              |
| `StaticAnalysisContext` | `@formspec/analysis`        | `SemanticAnalysisDomain` | TSDoc tag parsing, constraint extraction, FileSnapshot protocol. The "TypeScript-AST work" every IDE/lint tool would otherwise re-implement.          |
| `CompilationContext`    | `@formspec/build`           | `CompilationDomain`      | Canonicalize chain DSL and class-analysis output to FormIR; emit JSON Schema 2020-12 and JSON Forms UI Schema.                                        |
| `ConfigurationContext`  | `@formspec/config`          | `ConfigurationDomain`    | Load `formspec.config.ts` (or `.mts`/`.js`/`.mjs`); register extensions and custom constraints; restrict the FormSpec capability surface per project. |
| `RuntimeContext`        | `@formspec/runtime`         | `RuntimeDomain`          | `defineResolvers()` for dynamic enum and dynamic schema fields, with type-safe end-to-end binding.                                                    |
| `ValidatorContext`      | `@formspec/validator`       | `ValidationDomain`       | Wraps `@cfworker/json-schema` to provide JSON Schema 2020-12 validation in edge-runtime environments. No FormSpec-specific dependencies.              |
| `CliContext`            | `@formspec/cli`             | `DeveloperToolingDomain` | Drive schema and IR generation from the command line.                                                                                                 |
| `EslintContext`         | `@formspec/eslint-plugin`   | `DeveloperToolingDomain` | ESLint rules: constraint type-mismatch, contradictions, capability restrictions, with auto-fixes where unambiguous.                                   |
| `TsPluginContext`       | `@formspec/ts-plugin`       | `DeveloperToolingDomain` | TypeScript language-service plugin and reusable composable semantic service for IDE integrations.                                                     |
| `LanguageServerContext` | `@formspec/language-server` | `DeveloperToolingDomain` | LSP reference implementation; thin presentation layer over composable analysis and TS-plugin helpers.                                                 |

### Packages excluded from the formal model

Three packages do not appear in `formspec.cml` because they are not bounded contexts in their own right:

| Package                | Reason                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formspec` (umbrella)  | Pure re-export of `@formspec/core`, `@formspec/dsl`, `@formspec/build`, `@formspec/runtime`. No domain language of its own. Modelled as a packaging convenience. |
| `@formspec/playground` | Private playground app. Not currently present in the workspace; older docs may still reference it. A consumer of the production contexts, not a producer.        |
| `e2e`                  | Test workspace. Exercises the production contexts end-to-end but adds no architecturally relevant behavior.                                                      |

The `formspec` umbrella is still subject to dependency discipline: it must only re-export from the four upstream contexts listed above, and Phase 2's CI guardrail will enforce that.

---

## Context map at a glance

Every relationship in `formspec.cml` corresponds to a real `package.json` dependency. Logical/data-flow couplings without code-level imports (e.g., `ValidatorContext` consumes JSON Schema produced by `CompilationContext`) are not modelled as edges; they live in the context's vision statement instead.

CML notation, briefly:

- **D, U** — Downstream / Upstream.
- **OHS** — Open Host Service: the upstream provides a documented, stable protocol.
- **PL** — Published Language: a shared, well-defined vocabulary used across the boundary.
- **CF** — Conformist: the downstream accepts the upstream's model as-is, without translation. Used here for type-level consumption of `@formspec/core` and pure re-exports.
- **ACL** — Anti-Corruption Layer: the downstream translates the upstream's model into a different vocabulary. Used here for tooling boundaries (compilation, lint, IDE, LSP) where FormSpec semantics are adapted into another vocabulary.

### Who depends on whom (text rendering)

```
                       ┌──────────────────────┐
                       │  DomainModelContext  │  (the published language: FormIR)
                       │   @formspec/core     │
                       └──────────┬───────────┘
                                  │  OHS + PL  (CF — every internal context except Validator)
       ┌──────────────────┬───────┼──────────┬────────────────┬─────────────────┐
       │                  │       │          │                │                 │
       ▼                  ▼       ▼          ▼                ▼                 ▼
ChainDslContext   StaticAnalysis  Compilation Configuration  Runtime    (TsPlugin, LSP, ESLint)
@formspec/dsl     @formspec/      @formspec/  @formspec/     @formspec/
                  analysis        build       config         runtime
                       │             ▲           │
                       │  ACL+OHS+PL │           │  OHS
                       └─────────────┤           │
                                     │           │
                                     │           │
                          (CompilationContext consumes StaticAnalysis output
                           via ACL: canonicalization translates parsed-tag
                           info into FormIR per principle A4)

Developer tooling — translate upstream semantics into their own vocabularies (ACL):
  CliContext         (@formspec/cli)             ← Compilation (CF), Configuration
  EslintContext      (@formspec/eslint-plugin)   ← Compilation (ACL), StaticAnalysis (ACL), Configuration
  TsPluginContext    (@formspec/ts-plugin)       ← StaticAnalysis (ACL)
  LanguageServer     (@formspec/language-server) ← StaticAnalysis (ACL), Configuration

Standalone:
  ValidatorContext   (@formspec/validator)       — no internal upstreams; conforms to JSON Schema 2020-12

Re-export façade (not a bounded context — see "Packages excluded" above):
  formspec (umbrella)                            ← DomainModel, ChainDsl, Compilation, Runtime
```

### Key edges to know

| Downstream                                                                   | Upstream                | Pattern                 | What it means                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everyone except Validator                                                    | `DomainModelContext`    | `D, CF` ← `U, OHS, PL`  | All FormSpec contexts conform to FormIR types as the published language. A change to `@formspec/core`'s public surface is a project-wide change.                     |
| `CompilationContext`                                                         | `StaticAnalysisContext` | `D, ACL` ← `U, OHS, PL` | The build pipeline canonicalizes parsed comment-tag info into FormIR — that translation is an Anti-Corruption Layer per principle A4.                                |
| `LanguageServerContext`                                                      | `StaticAnalysisContext` | `D, ACL` ← `U, OHS, PL` | LSP translates FormSpec analysis output into wire-format LSP types. Textbook ACL.                                                                                    |
| `EslintContext`, `TsPluginContext`                                           | `StaticAnalysisContext` | `D, ACL` ← `U, OHS`     | Lint and TS-plugin translate analysis output into ESLint / tsserver vocabularies.                                                                                    |
| `EslintContext`                                                              | `CompilationContext`    | `D, ACL` ← `U, OHS`     | Lint rules adapt build-pipeline outputs into ESLint diagnostics and fix descriptors.                                                                                 |
| `CompilationContext`, `CliContext`, `EslintContext`, `LanguageServerContext` | `ConfigurationContext`  | `D, CF` ← `U, OHS`      | Capability restrictions and custom constraint registrations originate in `formspec.config.ts`. Downstreams consume `FormSpecConfig` as data, without translating it. |
| `CliContext`                                                                 | `CompilationContext`    | `D, CF` ← `U, OHS`      | The CLI is a thin wrapper over the build APIs (principle A6); it consumes them verbatim rather than translating.                                                     |

---

## Practical consequences

**Adding a new field type.** Define the type in `DomainModelContext` (`@formspec/core`). Add a builder in `ChainDslContext` (`@formspec/dsl`). Wire IR generation in `CompilationContext` (`@formspec/build`). If TSDoc tags can produce it, extend `StaticAnalysisContext` (`@formspec/analysis`). If the configuration system needs to be aware of it, update `ConfigurationContext` (`@formspec/config`). Lint rules live in `EslintContext` (`@formspec/eslint-plugin`).

**Adding a new constraint.** Define the constraint type in `DomainModelContext`. Register it in `ConfigurationContext`. Implement extraction and application in `CompilationContext`. Add semantic diagnostics in `StaticAnalysisContext`. (Phase 4 of the DDD campaign will codify this split via an ADR — `docs/adr/0001-constraint-ownership.md` (planned, not yet authored) — and barrel files; until that lands, follow the same logical split.)

**Adding a new tooling feature.** Decide whether it's a one-shot validation (lint) or a live editor capability (language server) per principle A7. Then place it in `EslintContext` or `LanguageServerContext` accordingly. Both consume `StaticAnalysisContext`.

**When in doubt about ownership.** Read the vision statement in `formspec.cml` for the candidate contexts, and pick the one whose package would _break_ if the new concept were removed. That's the owning context.

---

## Future evolution

The current model is `state = AS_IS`. When the architecture changes meaningfully, declare the new shape with a `state = TO_BE` ContextMap in `formspec.cml`, ship the implementation that brings reality in line, then flip to `AS_IS`.

Tactical-level DDD modelling (Aggregates, Entities, Value Objects) is intentionally absent. If a future need arises (e.g., agent-driven changes need finer-grained ownership signals than "which package"), revisit then.
