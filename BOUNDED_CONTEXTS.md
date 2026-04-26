# FormSpec Bounded Contexts

Reader-friendly companion to [`formspec.cml`](./formspec.cml). The CML file is the source of truth — this document describes what's there in prose for readers who don't know Context Mapper Language.

> **Keep in sync.** When you add or rename a bounded context, change a relationship, or change a context's responsibilities, update both `formspec.cml` and this document in the same PR. A future enhancement is to autogenerate this file from the CML; until then, treat the CML as authoritative and this file as the rendered view.

For project vocabulary, see [`GLOSSARY.md`](./GLOSSARY.md). For the architectural principles those contexts collectively satisfy, see [`docs/000-principles.md`](./docs/000-principles.md).

---

## Why bounded contexts?

A _bounded context_ is the part of the system inside which a particular domain language is internally consistent. FormSpec has 12 production packages; each one sits inside exactly one bounded context. Naming the contexts explicitly does three things:

1. **Helps contributors find where to make a change.** Every concept (Field, Constraint, Resolver, ...) has a single owning context — see [`GLOSSARY.md`](./GLOSSARY.md).
2. **Makes inter-package contracts deliberate.** A change to a context's public surface is a contract change with downstream consequences; the context map names every such contract.
3. **Enables CI guardrails.** A future check (planned for Phase 2 of the DDD-alignment campaign) parses `formspec.cml` and rejects any cross-package import not permitted by the context map.

The campaign deliberately stops at the strategic level (BoundedContexts + ContextMap). Tactical DDD modeling (Aggregates, Entities, Value Objects) is not in scope today.

---

## Subdomains at a glance

| Subdomain                | Type       | What it is                                                                                            |
| ------------------------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| `FormSpecModelDomain`    | CORE       | The canonical FormIR vocabulary every other context shares                                            |
| `AuthoringDomain`        | CORE       | The two surfaces developers use to express form definitions                                           |
| `CompilationDomain`      | CORE       | Canonicalization plus JSON Schema and UI Schema emission                                              |
| `ConfigurationDomain`    | SUPPORTING | `.formspec.yml` and DSL capability restriction                                                        |
| `RuntimeDomain`          | SUPPORTING | Resolver helpers for dynamic data at form-render time                                                 |
| `DeveloperToolingDomain` | SUPPORTING | IDE, lint, and CLI integrations                                                                       |
| `ValidationDomain`       | GENERIC    | Standard JSON Schema 2020-12 validation (conforms to an external standard, not to FormSpec specifics) |

CORE is where FormSpec's distinctive value lives. SUPPORTING domains are necessary but not what makes FormSpec FormSpec. GENERIC means an off-the-shelf solution works — for FormSpec, that's standard JSON Schema validation.

---

## Bounded contexts

Each row below maps a CML `BoundedContext` to its npm package and primary responsibilities. Cell labels match the identifiers in [`formspec.cml`](./formspec.cml) — search there for the full vision statement.

| Bounded context         | Package                     | Subdomain                | Role / responsibilities                                                                                                                      |
| ----------------------- | --------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DomainModelContext`    | `@formspec/core`            | `FormSpecModelDomain`    | Defines and publishes the canonical FormIR. Discriminated FormElement union, IR node types, constraint/annotation registration APIs.         |
| `ChainDslContext`       | `@formspec/dsl`             | `AuthoringDomain`        | Fluent builder API: `field.*`, `group`, `when`, `formspec`. Full type inference of the resulting schema.                                     |
| `StaticAnalysisContext` | `@formspec/analysis`        | `AuthoringDomain`        | TSDoc tag parsing, constraint extraction, FileSnapshot protocol. The "TypeScript-AST work" every IDE/lint tool would otherwise re-implement. |
| `CompilationContext`    | `@formspec/build`           | `CompilationDomain`      | Canonicalize chain DSL and class-analysis output to FormIR; emit JSON Schema 2020-12 and JSON Forms UI Schema.                               |
| `ConfigurationContext`  | `@formspec/config`          | `ConfigurationDomain`    | Load `.formspec.yml`; register custom constraints; restrict the FormSpec capability surface per project.                                     |
| `RuntimeContext`        | `@formspec/runtime`         | `RuntimeDomain`          | `defineResolvers()` for dynamic enum and dynamic schema fields, with type-safe end-to-end binding.                                           |
| `ValidatorContext`      | `@formspec/validator`       | `ValidationDomain`       | Wraps `@cfworker/json-schema` to provide JSON Schema 2020-12 validation in edge-runtime environments. No FormSpec-specific dependencies.     |
| `CliContext`            | `@formspec/cli`             | `DeveloperToolingDomain` | Drive schema and IR generation from the command line.                                                                                        |
| `EslintContext`         | `@formspec/eslint-plugin`   | `DeveloperToolingDomain` | ESLint rules: constraint type-mismatch, contradictions, capability restrictions, with auto-fixes where unambiguous.                          |
| `TsPluginContext`       | `@formspec/ts-plugin`       | `DeveloperToolingDomain` | TypeScript language-service plugin and reusable composable semantic service for IDE integrations.                                            |
| `LanguageServerContext` | `@formspec/language-server` | `DeveloperToolingDomain` | LSP reference implementation; thin presentation layer over composable analysis and TS-plugin helpers.                                        |
| `UmbrellaContext`       | `formspec`                  | `FormSpecModelDomain`    | Single-import re-export of common runtime-facing APIs from core, dsl, build, runtime.                                                        |

---

## Context map at a glance

Every relationship in `formspec.cml` corresponds to a real `package.json` dependency. Logical/data-flow couplings without code-level imports (e.g., `ValidatorContext` consumes JSON Schema produced by `CompilationContext`) are not modelled as edges; they live in the context's vision statement instead.

CML notation, briefly:

- **D, U** — Downstream / Upstream.
- **OHS** — Open Host Service: the upstream provides a documented, stable protocol.
- **PL** — Published Language: a shared, well-defined vocabulary used across the boundary.
- **CF** — Conformist: the downstream accepts the upstream's model as-is, without translation.

### Who depends on whom (text rendering)

```
                       ┌──────────────────────┐
                       │  DomainModelContext  │  (the published language: FormIR)
                       │   @formspec/core     │
                       └──────────┬───────────┘
                                  │  OHS + PL
       ┌──────────────────┬───────┼─────────────────┬──────────────────┐
       │                  │       │                 │                  │
       ▼                  ▼       ▼                 ▼                  ▼
ChainDslContext   StaticAnalysis  Compilation   Configuration       Runtime
@formspec/dsl     @formspec/      @formspec/    @formspec/          @formspec/
                  analysis        build         config              runtime
                       │             │              │
                       │             │              │
                       └────OHS──────┤              │
                                     │              │
                                     ├──OHS─────────┤
                                     │              │
                                     ▼              ▼
                            (consumed by tooling and CLI below)

Developer tooling (all CONFORMIST downstreams of the analysis/build/config OHS):
  CliContext         (@formspec/cli)             ← Compilation, Configuration
  EslintContext      (@formspec/eslint-plugin)   ← Compilation, StaticAnalysis, Configuration
  TsPluginContext    (@formspec/ts-plugin)       ← StaticAnalysis
  LanguageServer     (@formspec/language-server) ← StaticAnalysis, Configuration

Re-export aggregator:
  UmbrellaContext    (formspec)                  ← DomainModel, ChainDsl, Compilation, Runtime

Standalone:
  ValidatorContext   (@formspec/validator)       — no internal upstreams; conforms to JSON Schema 2020-12
```

### Key edges to know

| Downstream                                       | Upstream                            | Pattern                | What it means                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Everyone except Validator                        | `DomainModelContext`                | `D, CF` ← `U, OHS, PL` | All FormSpec contexts conform to FormIR types as the published language. A change to `@formspec/core`'s public surface is a project-wide change. |
| `CompilationContext`                             | `StaticAnalysisContext`             | `D, CF` ← `U, OHS, PL` | The build pipeline consumes parsed comment-tag info; the analysis package owns that parsing.                                                     |
| `EslintContext`, `LanguageServerContext`         | `StaticAnalysisContext`             | `D, CF` ← `U, OHS`     | IDE/lint tools reuse the same analysis instead of re-implementing TypeScript-AST traversal.                                                      |
| `CompilationContext`, `EslintContext`, etc.      | `ConfigurationContext`              | `D, CF` ← `U, OHS`     | Capability restrictions and custom constraint registrations originate in `.formspec.yml`.                                                        |
| `CliContext`, `EslintContext`, `UmbrellaContext` | `CompilationContext`                | `D, CF` ← `U, OHS`     | Anything that produces or inspects schemas delegates to the build pipeline; nobody else reaches into the analyzer or generators directly.        |
| `UmbrellaContext`                                | `ChainDslContext`, `RuntimeContext` | `D, CF` ← `U, OHS`     | Pure re-exports for end users.                                                                                                                   |

---

## Practical consequences

**Adding a new field type.** Define the type in `DomainModelContext` (`@formspec/core`). Add a builder in `ChainDslContext` (`@formspec/dsl`). Wire IR generation in `CompilationContext` (`@formspec/build`). If TSDoc tags can produce it, extend `StaticAnalysisContext` (`@formspec/analysis`). If the configuration system needs to be aware of it, update `ConfigurationContext` (`@formspec/config`). Lint rules live in `EslintContext` (`@formspec/eslint-plugin`).

**Adding a new constraint.** Define the constraint type in `DomainModelContext`. Register it in `ConfigurationContext`. Implement extraction and application in `CompilationContext`. Add semantic diagnostics in `StaticAnalysisContext`. (Phase 4 of the DDD campaign codifies this split via an ADR and barrel files; until that lands, follow the same logical split.)

**Adding a new tooling feature.** Decide whether it's a one-shot validation (lint) or a live editor capability (language server) per principle A7. Then place it in `EslintContext` or `LanguageServerContext` accordingly. Both consume `StaticAnalysisContext`.

**When in doubt about ownership.** Read the vision statement in `formspec.cml` for the candidate contexts, and pick the one whose package would _break_ if the new concept were removed. That's the owning context.

---

## Future evolution

The current model is `state = AS_IS`. When the architecture changes meaningfully, declare the new shape with a `state = TO_BE` ContextMap in `formspec.cml`, ship the implementation that brings reality in line, then flip to `AS_IS`.

Tactical-level DDD modelling (Aggregates, Entities, Value Objects) is intentionally absent. If a future need arises (e.g., agent-driven changes need finer-grained ownership signals than "which package"), revisit then.
