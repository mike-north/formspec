# 000 — Principles & Properties

This document establishes the invariants that all FormSpec design and implementation must satisfy. Every subsequent design doc (001–006) references specific principles from this document.

---

## 1. Product Principles

**PP1: TypeScript-native authoring.** FormSpec authors write TypeScript — not JSON, YAML, or a custom DSL grammar. Both authoring surfaces (TSDoc-annotated types and the chain DSL) are valid TypeScript that passes `tsc` with strict mode enabled.

**PP2: Inference over declaration.** Where TypeScript's type system can infer information (field types, optionality, enum members), FormSpec derives it automatically rather than requiring redundant declarations.

**PP3: Constraint model mirrors TypeScript's type theory.** TypeScript developers already think about types as sets of allowed values — subtypes narrow the set, intersections combine constraints, and specialization is monotonic. FormSpec's constraint system should align with this mental model. When a type is derived from another, constraints refine (narrow) exactly as a TypeScript developer would expect from extending or intersecting types. This applies across the full type derivation chain: type aliases inherit and compose constraints naturally (`type USDCents = Integer` with `@minimum 0` → any field of type `USDCents` inherits the bound), interfaces extend constraints, and fields can further narrow but never broaden. The constraint algebra should feel like a natural extension of the type system, not a parallel system with its own rules.

**PP4: Static analysis first.** All metadata needed to produce schemas is extractable at build time via the TypeScript compiler API. Runtime reflection is not required and is not used for schema generation.

**PP5: Two surfaces, one semantic model, with explicit exceptions.** The TSDoc-annotated type surface and the chain DSL surface are alternative syntaxes for the same semantic model for the shared static feature set. Enumerated exceptions are allowed only when this specification calls them out explicitly. Outside those explicit exceptions, neither surface has capabilities the other lacks (modulo ergonomic differences).

**PP6: JSON Schema as the normative output.** FormSpec compiles to standard JSON Schema (2020-12 vocabulary where possible, with a documented custom vocabulary for FormSpec-specific semantics). JSON Schema output must validate against the JSON Schema meta-schema.

**PP7: High-fidelity JSON Schema output.** The generated JSON Schema should faithfully represent the structure and semantics of the TypeScript source, not just produce something that validates correctly. Named types should appear as `$defs` with `$ref` — not inlined — so that the difference between a reusable interface and an ad hoc object literal is preserved. Custom validators (e.g., decimal precision) should be registered as proper JSON Schema vocabulary keywords that validators can execute, not opaque metadata that downstream systems must interpret through convention. The JSON Schema output should work as a standalone artifact, not require a FormSpec-aware consumer to be useful.

**PP8: Progressive complexity.** A simple form (a few text fields) requires minimal code. Advanced features (custom constraints, dynamic fields, conditional visibility) are opt-in and do not add ceremony to simple cases.

**PP9: Configurable surface area.** Not every consumer of FormSpec supports the full breadth of JSON Schema and JSON Forms. FormSpec must be configurable so that teams can pare down to the subset they actually support — disabling specific value types (e.g., no floating-point numbers), forbidding certain comment tags, or restricting layout features. Lint rules and build-time validation enforce the configured subset. Authors working within a constrained profile should never feel like they're fighting a library that tries to enable too much.

**PP10: White-labelable.** FormSpec is designed to be embedded and rebranded by adopting organizations. User-facing strings — diagnostic code prefixes, JSON Schema vendor prefixes, CLI tool names, error messages — must not hard-code "formspec" in a way that cannot be overridden. Configuration controls the branding that end users see. This aligns with PP9 (configurable surface area) and E3 (configurable vendor prefix).

**PP11: Consumer-controlled messaging.** Downstream consumers of FormSpec must have control over user-facing output — diagnostic messages, error text, schema descriptions, and any other content that code authors or end users see. FormSpec provides reasonable defaults, but organizations can override message templates, severity descriptions, and instructional text to match their own terminology, style guides, and audience expectations.

This principle also applies to inferred naming metadata. When FormSpec derives a serialized name or display label rather than taking an explicit author value, the inference and plural-inflection rules must be consumer-configurable build policy rather than a hard-coded global convention. Default transforms may exist, but downstream consumers control whether inference is enabled and what transformation/inflection functions are used.

**PP12: Pre-1.0 freedom.** Breaking changes are acceptable. The system prioritizes getting the model right over backward compatibility with alpha-era APIs.

**PP13: TSDoc tags should read as complete thoughts.** A FormSpec TSDoc tag does not need to be a grammatically complete sentence, but it should express the primary idea being captured without requiring the reader to infer a missing qualifier. Tag names should therefore be semantically specific enough that the comment reads naturally and unambiguously at the point of use.

Good built-in examples:

- `@displayName` = a human-friendly name that is displayed to people (for example in a GUI)
- `@apiName` = a name used in programmatic, machine-oriented contracts (for example REST APIs, webhooks, or restricted API key permissions)

These names are good because the semantic role is visible in the tag itself. By contrast, generic names like `@data` are weak when they obscure the primary meaning at the point of use — for example, `@data countries` says almost nothing about whether the comment is describing selectable options, backing records, provenance, or some other unrelated notion of "data". This principle applies to both built-in tags and extension tags.

---

## 2. Semantic Properties

These are invariants the type and constraint system must satisfy.

**S1: Specialization narrows, never broadens.** A constraint refinement (e.g., applying `@minimum 0` to a number field) can only narrow the set of valid values. No composition of constraints may broaden a previously narrowed set.

**S2: Contradiction detection is decidable.** For all built-in constraint combinations, the system can determine at build time whether a set of constraints is satisfiable (e.g., `@minimum 10 @maximum 5` is a detectable contradiction). Custom constraints may opt into decidable contradiction checking but are not required to.

**S3: Constraint provenance is preserved.** Every constraint in the canonical IR records where it came from (which TSDoc tag, which chain DSL call, which line/column). This enables diagnostics that point to the source of contradictions rather than the point of detection.

**S4: Type determines applicable constraints.** The set of constraints that may be applied to a field is determined by its type. Applying `@minLength` to a number field is a static error, not a runtime no-op.

**S5: Few tags, composable grammar.** The tag vocabulary should be small, with broadly applicable grammar rules that combine orthogonally rather than a proliferation of specialized tags. For example, `@minimum` applies directly to a primitive field, and the same tag targets a subfield of a complex type via a `:path` modifier:

```typescript
/** @minimum 4 */
x: number;

/** @minimum :value 4 */
discount: MonetaryAmount; // { value: number, currency: string }
```

The `:path` grammar is not specific to `@minimum` — it works across any tag where targeting a nested property is meaningful. Similarly, member-targeting syntax works across tags that annotate union members:

```typescript
/**
 * @displayName :sync Synchronous
 * @displayName :async Asynchronous
 */
mode: "sync" | "async";
```

A new capability (like path targeting) should unlock expressiveness across many existing tags, not require inventing new ones.

**S6: Reuse ecosystem tags.** Where JSDoc, TSDoc, or API Extractor already define a tag with the right semantics, FormSpec uses it directly rather than inventing a FormSpec-specific equivalent. `@defaultValue`, `@deprecated`, `@param`, `@example`, etc. are standard tags that tools already understand — editors provide autocomplete, documentation generators render them, and developers already know them. FormSpec-specific tags are reserved for concepts that have no ecosystem equivalent.

**S7: Embrace TypeScript's full expressiveness.** FormSpec should not artificially restrict which TypeScript or JavaScript language features authors can use. If a language construct reasonably maps to a JSON Schema concept, FormSpec should support it. For example, JSON Schema has enums — FormSpec should handle `const enum`, non-const `enum`, string literal union types, and `as const` arrays, not force authors into a single pattern. Similarly, comment tags and the chain DSL should be applicable wherever the underlying semantics make sense, not limited to a narrow set of blessed patterns.

**S8: Optionality is orthogonal to constraints.** Whether a field is required or optional is independent of its value constraints. A required field with `@minimum 0` means "must be present and ≥ 0"; an optional field with the same constraint means "if present, must be ≥ 0".

---

## 3. Architectural Properties

Structural invariants for the system's internal design.

**A1: Canonical IR is the single intermediate representation.** Both DSL surfaces compile to the same canonical IR. All downstream operations (JSON Schema generation, UI Schema generation, validation, diagnostics) consume the IR — never the surface syntax directly.

**A2: IR is serializable and inspectable.** The canonical IR can be serialized to JSON for debugging, testing, and tooling. It is a plain data structure, not a graph of live TypeScript compiler objects.

**A3: Generation is a pure function of the IR.** Given an identical canonical IR, JSON Schema and UI Schema generators produce identical output. No ambient state, no configuration leakage between runs.

**A4: The IR captures semantics, not syntax.** The canonical IR does not preserve whether a constraint was authored as a TSDoc tag or a chain DSL option. Surface-specific details belong to provenance metadata, not the semantic model.

**A5: Build pipeline is stratified.** The pipeline has clear phases: Parse → Analyze → Canonicalize (to IR) → Validate (constraints/contradictions) → Generate (JSON Schema, UI Schema). Each phase's output is the next phase's input. No phase reaches back into an earlier phase's data structures.

**A6: Library-first, CLI as thin wrapper.** FormSpec is consumable both as a programmatic library and as a CLI. The library is the primary interface; the CLI is a thin wrapper that parses arguments and delegates to library APIs. This ensures every CLI capability is also available programmatically.

**A7: Clear linting vs. language server boundary.** ESLint and the language server have distinct, non-overlapping responsibilities. ESLint owns validation, error detection, and auto-fixes — any mechanical code transformation runs as a lint fix. The language server owns the authoring experience — completions (e.g., tab-completing field name tokens like `:value` in path-target syntax), hover information, go-to-definition, and signature help for TSDoc tags. If a capability could live in either tool, it defaults to linting unless it requires editor interaction (cursor position, incremental typing, live feedback during composition).

**A8: Pay only for what you use.** Runtime footprint must be intentionally minimal, with capabilities consumed incrementally. Features like dynamic schema resolution (which may pull in JSON Schema serialization utilities) should be isolated in separate entry points or packages so that consumers who don't need them pay no import cost. A simple form with static fields should not transitively depend on runtime machinery for advanced features.

---

## 4. Composition Properties

How constraints and form elements interact when combined.

**C1: Two composition rules, determined by kind.** Metadata in FormSpec is either _set-influencing_ (constraints that narrow the set of valid values) or _value-influencing_ (resolved identity metadata plus annotations that carry a single scalar such as a description, a default, or a UI hint). The kind determines the composition rule:

- **Set-influencing (constraints):** compose via intersection. `@minimum 0` + `@maximum 100` means values in [0, 100]. Each constraint further narrows; none can broaden.
- **Value-influencing (identity metadata and annotations):** compose via override — closest to the point of use wins. A `@defaultValue` on a field overrides one from its type definition, which overrides one from a base type. The same applies to resolved naming metadata, descriptions, and UI hints.

**C2: Schema shape is never altered for presentation.** The data model and the presentation of that data are separate concerns. Presentation decisions (visual grouping, field ordering, section labels) never affect the shape of the generated schema. A `group()` element affects UI layout only — it does not create a new scope, namespace, or nesting level in the data schema. Fields inside a group appear at the same schema level as if the group were absent.

**C3: Conditionals affect visibility, not schema membership.** A field wrapped in `when()` is always present in the JSON Schema. The conditional controls UI visibility (via JSON Forms rules) but does not remove the field from the data model. Conditional fields become optional in the inferred TypeScript type.

**C4: Object fields create data nesting.** Unlike groups, `field.object()` creates a nested object in the schema. Object nesting is a data-model decision, not a UI decision.

---

## 5. Extensibility Properties

What extension authors can and cannot do.

**E1: Built-in types use the same extension API.** Every built-in field type and constraint is implemented using the same interfaces available to extension authors. There are no privileged internal-only APIs for built-in types.

**E2: Custom constraints declare their composition rules.** A custom constraint must declare whether it is refining (intersects with other constraints) or annotating (most-specific-wins). The system does not guess.

**E3: Custom vocabulary keywords are namespaced.** Extension-defined JSON Schema keywords use a configurable vendor prefix (defaulting to `x-formspec-`) followed by the extension name: `x-<vendor>-<extension-name>-`. Organizations adopting FormSpec can set their own prefix (e.g., `x-stripe-`) so that generated schemas align with their existing conventions. No custom keyword may collide with a standard JSON Schema keyword.

**E4: Extensions cannot weaken the type system.** An extension may add new field types, constraints, or annotations, but it cannot disable built-in type checking, bypass constraint validation, or suppress contradiction detection for built-in constraints.

**E5: Extensions are npm packages.** Extensions are distributed as npm packages identified by a conventional keyword in `package.json` (e.g., `"keywords": ["formspec-extension"]`). npm registries are the plugin ecosystem; npm is the plugin manager. Discovery is automatic — FormSpec scans installed dependencies for the keyword at initialization time. No separate plugin registry, no manual configuration, no monkey-patching. This gets dependency management, versioning, publishing, and access control for free.

---

## 6. Boundary Properties

Where enforcement and coercion happen.

**B1: Enforcement at integration boundaries.** Constraint validation, type checking, and schema validation happen at system boundaries — when schemas are generated, when forms are submitted, when external data is ingested. Internal pipeline stages trust the IR.

**B2: No implicit coercion in the IR.** The canonical IR represents values and types exactly as authored. Type coercion (e.g., string-to-number) is the responsibility of runtime form renderers, not the schema generator.

**B3: Lossy transformations are configurable.** Any point in the pipeline where information or precision can be lost must be configurable by downstream consumers. For example, if a decimal value with arbitrary precision must be narrowed to a fixed number of significant figures, the system does not silently round. Instead, the consumer configures the rounding behavior (round-up, round-down, floor, ceiling, round-half-even, etc.) or the system rejects the loss and requires an explicit precision annotation. In low-stakes contexts, implicit rounding may be acceptable and can be configured as the default. In high-stakes contexts (e.g., financial calculations), precision loss must be an explicit, author-acknowledged decision — never a surprise.

**B4: JSON Schema is the contract boundary.** The generated JSON Schema is the definitive statement of what data is valid. If the IR and JSON Schema disagree, the JSON Schema is wrong (fix the generator), not the IR.

**B5: UI Schema is advisory.** The UI Schema provides rendering hints but does not override the JSON Schema's validation constraints. A form renderer that ignores the UI Schema entirely still produces data valid against the JSON Schema.

---

## 7. Diagnostic Properties

Error reporting invariants.

**D1: Diagnostics are structured.** Every diagnostic carries: source location (file, line, column, span), severity (error, warning, info), a stable machine-readable symbolic code (e.g., `CONTRADICTION`), and a human-readable message. Vendor-specific branding, if any, is presentation-layer text rather than part of the diagnostic code.

**D2: Diagnostics are source-located.** Errors point to the author's source code, not to intermediate representations or generated output. When a contradiction involves two constraints, the diagnostic references both source locations.

**D3: Diagnostics are deterministic.** The same input always produces the same set of diagnostics in the same order. No nondeterministic iteration over maps or sets.

**D4: Diagnostics are actionable.** Each diagnostic message suggests a fix or explains what the author should do. "Contradiction: @minimum 10 exceeds @maximum 5" not just "Invalid constraints."

**D5: Diagnostics offer auto-fixes when unambiguous.** Where the system has high confidence in the correct resolution, diagnostics should provide an automatic fix. For example, if all union members except one have a `@displayName`, the system can offer to derive one from the member's identifier (e.g., `snake_case` → "Sentence case"). Auto-fixes are only offered when the intent is unambiguous — if multiple reasonable fixes exist, the diagnostic describes the issue and leaves the choice to the author.

**D6: Diagnostics are machine-consumable.** The diagnostic format supports integration with IDEs (Language Server Protocol), CI (SARIF or equivalent), and ESLint (RuleTester-compatible). Structured codes enable filtering and aggregation.

---

## 8. Non-Properties

Things FormSpec explicitly does NOT guarantee. These are useful for preventing scope creep and clarifying design trade-offs.

**NP1: No decorator-based authoring.** The decorator DSL is removed. TSDoc-annotated types and the chain DSL are the two authoring surfaces. Decorators added complexity (branded type resolution, no-op runtime markers, custom decorator factories) that is better served by TSDoc tags with composable grammar (see S5).

**NP2: Runtime validation is an independent concern.** Schema generation and runtime type checking are separate capabilities with separate dependency graphs. A future runtime validation package may exist, but it would be an independently consumable component — not part of the core set of packages needed to describe or extract schemas from a TypeScript codebase. Consumers who only need build-time schema generation never pay for runtime validation machinery.

**NP3: No round-trip fidelity.** Generating a FormSpec definition from a JSON Schema is not a supported use case. The pipeline is one-directional: FormSpec → IR → JSON Schema.

**NP4: No cross-language support.** FormSpec is a TypeScript tool. It does not generate schemas from Python, Java, or other language sources.

**NP5: No guaranteed JSON Schema draft compatibility beyond the target draft.** FormSpec targets a specific JSON Schema draft (2020-12 or as determined by the vocabulary design). Backward compatibility with older drafts (draft-07, draft-04) is not guaranteed.

**NP6: No visual form builder.** FormSpec is a code-first tool. The playground provides preview feedback, not a drag-and-drop editor. WYSIWYG authoring is not a design goal.

---

## Cross-Reference Index

Subsequent design documents reference these principles by ID. For traceability:

| Principle                                                          | Referenced by                |
| ------------------------------------------------------------------ | ---------------------------- |
| PP2, PP3, PP7, A1, A4, A5, S1–S7, C1, D1, D2, D4, E1–E5, NP1       | 001 (Canonical IR)           |
| PP1, PP2, PP9, PP10, S4–S7, D1–D6                                  | 002 (TSDoc Grammar)          |
| PP2, PP6, PP7, PP9, PP10, S1, B3, B4, E3                           | 003 (JSON Schema Vocabulary) |
| A7, PP9, PP10, PP11, D1–D6, E1                                     | 004 (Tooling)                |
| PP2, PP3, S1, S2, S4, S7, B3, B4, C1, E1–E5                        | 005 (Numeric Types)          |
| PP3, PP5, PP6, PP7, A1–A4, S1, S5, C1, D1, D3, D4, E1, E4, E5, NP1 | 006 (Parity Testing)         |
