# FormSpec Glossary

The shared vocabulary of the FormSpec project. Use these terms verbatim in code, comments, commits, PR descriptions, and documentation.

For the architectural roles of packages, see [`BOUNDED_CONTEXTS.md`](./BOUNDED_CONTEXTS.md) and the formal model in [`formspec.cml`](./formspec.cml). For the architectural principles those terms support, see [`docs/000-principles.md`](./docs/000-principles.md).

---

## Form-shaped concepts

### FormSpec (project) vs `FormSpec` (type)

- **FormSpec** (capitalized, prose): the project itself.
- **`FormSpec`** (code identifier): the root TypeScript type produced by the chain DSL `formspec(...)` factory and the inferred shape of a class-based form.

When ambiguity is possible, prefer "FormSpec project" or "the `FormSpec` type." Do not introduce new aliases.

Owning bounded context: `DomainModelContext` (`@formspec/core`).

### Form

The user-facing artifact. A _form_ is what an end user fills in. In code, a form is represented either by a `FormSpec` value (chain DSL) or by a TypeScript class annotated with TSDoc (static-analysis surface). Both representations canonicalize to the same FormIR.

### Form Element

Any node that can appear inside a form: a Field, a Group, or a Conditional. Discriminated union exported from `@formspec/core`.

Owning bounded context: `DomainModelContext`.

### Field

A leaf in a form definition that maps to a single value in the resulting data model. Examples: `TextField`, `NumberField`, `BooleanField`, `StaticEnumField`, `DynamicEnumField`, `ArrayField`, `ObjectField`.

Note: `ObjectField` creates schema nesting; `Group` does not. See **Group vs Object** below.

Owning bounded context: `DomainModelContext`.

### Group

A UI-only organizational element (a labelled section). A group affects rendering only — fields inside a group appear at the same level in the JSON Schema as if the group were absent. See principle C2.

Owning bounded context: `DomainModelContext`.

### Conditional

A `when(...)` wrapper that controls whether wrapped fields are _visible_ in the rendered UI. Wrapped fields remain present in the JSON Schema and become optional in the inferred TypeScript type. See principle C3.

Owning bounded context: `DomainModelContext`.

### Group vs Object

These are deliberately different concepts:

| Element        | Affects schema shape? | Affects UI?             | Use when                                      |
| -------------- | --------------------- | ----------------------- | --------------------------------------------- |
| `Group`        | No                    | Yes (visual grouping)   | Organize UI without changing data shape       |
| `field.object` | Yes (creates nesting) | Yes (renders as nested) | Data model genuinely contains a nested object |

---

## Intermediate representation

### Canonical IR (prose) / `FormIR` (type)

The single intermediate representation that both authoring surfaces compile to. **"Canonical IR"** is the prose name used in docs and commit messages. **`FormIR`** is the TypeScript identifier used in code. They refer to the same thing.

The IR is a plain serializable data structure (principle A2), captures semantics rather than syntax (principle A4), and is the only thing downstream generators read (principle A1).

Owning bounded context: `DomainModelContext`.

### `FieldNode`

The IR-level representation of a Field. Distinct from a `Field` from `@formspec/core/types/elements.ts`: a `Field` is the authoring-surface type, and a `FieldNode` is its IR shape after canonicalization, with resolved type, constraints, and annotations attached.

### `TypeNode`

The IR-level representation of a TypeScript type. A discriminated union (`PrimitiveTypeNode`, `EnumTypeNode`, `ArrayTypeNode`, `ObjectTypeNode`, `RecordTypeNode`, `UnionTypeNode`, `ReferenceTypeNode`, `DynamicTypeNode`, `CustomTypeNode`).

### `ConstraintNode`

The IR representation of a constraint applied to a field. A discriminated union covering numeric, length, pattern, cardinality, const, and custom constraints. See **Constraint** below for the broader concept.

### `AnnotationNode`

The IR representation of a value-influencing annotation (`@displayName`, `@defaultValue`, `@deprecated`, etc.). Composes via override (closest-to-use wins) per principle C1.

### Provenance

Origin metadata attached to every IR-level constraint and annotation: the surface (chain DSL vs TSDoc), file, line, column, and the originating tag name. Diagnostics use Provenance to point at the author's source rather than at the IR (principle D2). See principle S3.

Owning bounded context: `DomainModelContext`. Currently constructed in multiple places — consolidating this is captured as a future Phase 5 follow-up.

### Path Target

The IR concept for "this annotation/constraint targets a nested property at this path." Encoded as a `segments: string[]` array. Used by the `:value`, `:async`, etc. modifier syntax in TSDoc tags. See principle S5.

---

## Authoring concepts

### Chain DSL

The fluent builder authoring surface: `field.text(...)`, `field.number(...)`, `group(...)`, `when(...)`, `formspec(...)`. Lives in `@formspec/dsl`. Produces values typed by `@formspec/core`.

Owning bounded context: `ChainDslContext`.

### Static-Analysis Authoring Surface

The TypeScript-class authoring surface. The author writes a TypeScript class or interface with TSDoc tags; FormSpec extracts the schema shape via the TypeScript Compiler API. No runtime reflection (principle PP4).

Owning bounded context: `StaticAnalysisContext` (extraction) + `CompilationContext` (canonicalization).

### TSDoc Tag / JSDoc Tag

Tags written in code comments (`@minimum 0`, `@displayName "Age"`, etc.). FormSpec uses **TSDoc** as the spec FormSpec conforms to. **JSDoc** is the older, looser tradition; the names overlap in practice. When precision matters, write **TSDoc tag**. When referencing the older ecosystem (e.g., `@param`), JSDoc is fine.

See principle S6 (Reuse ecosystem tags).

### Canonicalization

The transformation from an authoring-surface value (chain DSL output, or a class analysis result) into a `FormIR`. The IR is the input to all downstream generators (principle A1).

Owning bounded context: `CompilationContext`.

### Compilation

The full pipeline from authoring input to JSON Schema 2020-12 + JSON Forms UI Schema. Comprises: parse → analyze → canonicalize → validate → generate (principle A5).

Owning bounded context: `CompilationContext`.

---

## Constraint and annotation system

### Constraint

A **set-influencing** piece of metadata that narrows the set of allowed values for a field (principle C1). Examples: `@minimum`, `@maximum`, `@pattern`, `@minLength`. Constraints compose by intersection — adding a constraint can only narrow, never broaden (principle S1).

Constraint logic is owned by:

- `DomainModelContext` (`@formspec/core`) — the `Constraint` IR type and registration interfaces.
- `ConfigurationContext` (`@formspec/config`) — user-facing registration via `defineConstraints`.
- `CompilationContext` (`@formspec/build`) — extraction from source and application during IR construction.
- `ValidatorContext` (`@formspec/validator`) — runtime enforcement against generated schemas.
- `StaticAnalysisContext` (`@formspec/analysis`) — semantic diagnostics about constraint usage.

This split is codified in the constraint-ownership ADR (`docs/adr/0001-constraint-ownership.md`, planned for Phase 4).

### Annotation

A **value-influencing** piece of metadata: identity metadata (display name, API name) plus single-scalar UI hints and documentation (description, default value, deprecation marker, format, placeholder). Annotations compose by override — closest-to-use wins (principle C1).

Owning bounded context: `DomainModelContext`.

### Extension

A package distributed via npm that registers custom field types, constraints, or annotations with FormSpec (principle E5). Extensions use the same APIs as built-in types (principle E1).

Owning bounded context: declared by `DomainModelContext`; orchestrated by `CompilationContext` and `ConfigurationContext`.

---

## Runtime and dynamic data

### Resolver

A function that supplies the runtime data for a Dynamic Field. Resolvers are bound to fields by name via `defineResolvers(...)`. The chain DSL knows about the resolver's input/output types end-to-end.

Not to be confused with **Data Source** or **Dynamic Source** — see below.

Owning bounded context: `RuntimeContext`.

### Data Source

The conceptual external system or in-process value store from which a Dynamic Field's options or schema are pulled (e.g., a remote API, an in-memory list). Distinct from **Resolver**, which is the _function_ the consumer supplies; the data source is what the resolver fetches _from_.

### Dynamic Source / `x-formspec-source`

The IR-level marker that names a runtime data source. The field carries an `x-formspec-source` JSON Schema vendor extension keyword identifying which resolver should populate it.

When in doubt, prefer **Resolver** for the function and **data source** for the underlying system.

---

## Configuration

### `.formspec.yml`

The project-level configuration file consumed by `@formspec/config`. Declares allowed field types, allowed layout features, allowed field options, and custom constraint registrations.

Owning bounded context: `ConfigurationContext`.

### Capability

A FormSpec feature that the configuration system can enable or disable per project (e.g., "dynamic enums," "conditional layout," "placeholder option"). Capability restrictions are enforced at three layers: ESLint plugin (build-time), `validateFormSpecElements()` (programmatic), and `@formspec/config/browser` (browser-embedded).

---

## Where this glossary lives in the model

Each entry above names an **owning bounded context** as defined in [`formspec.cml`](./formspec.cml). When code or docs introduce a new term, add it here and tie it to the context that owns it. When in doubt about which context owns a term, the rule is: the context whose package would _break_ if the term were removed owns it.
