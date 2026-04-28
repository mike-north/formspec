# Spec Changelog

This file tracks agreed changes and clarifications to the spec documents in `scratch/`.

## Usage

- Add entries only when a contradiction, ambiguity, or implementation blocker is resolved.
- Group entries by the spec document being changed.
- Link each entry back to the corresponding item in `scratch/spec-risk-log.md` when applicable.

# 2026-04-27

## 000-principles.md

- Added PP15 — Constraint kinds.
  - "Constraint" is the umbrella term for narrowing rules in FormSpec.
  - **Data constraints** narrow valid values of a field; authored as TSDoc tags, represented in the IR as `ConstraintNode`, emitted as JSON Schema validation keywords.
  - **DSL policy** narrows which FormSpec features a project may author; composed of building-block constraints (field-type, layout, rule-effect, etc.) loaded from `FormSpecConfig` and enforced at authoring/lint time.
  - Spec docs that introduce constraint-related concepts must specify which kind they mean.
  - Resolves the documentation half of [#419](https://github.com/mike-north/formspec/issues/419); the DSL-policy factoring follow-up is tracked in [#420](https://github.com/mike-north/formspec/issues/420).

# 2026-04-26

## 002-tsdoc-grammar

- Added `ANONYMOUS_RECURSIVE_TYPE` to the type-compatibility diagnostic taxonomy.
  - Anonymous recursive object shapes are now an error with guidance to extract the shape to a named class, interface, or type alias.
  - No auto-fix is defined because choosing the declaration name and scope is author intent.

## 004-tooling

- Added §2.7 for the public `@formspec/ts-plugin` embedding API and reduced §2.4.1 to a cross-reference.
- Added `type-compatibility/no-anonymous-recursive-type` to the ESLint recommended and strict rule inventory.
  - The rule reports the build analyzer's `ANONYMOUS_RECURSIVE_TYPE` diagnostic at the recursive source edge.

## 001-canonical-ir

- Updated §2.7 to match the 2026-03-26 circular-reference supersession.
  - Named recursive class/interface/type-alias graphs are supported through registry-backed `ReferenceTypeNode` back-edges.
  - Anonymous recursive shapes now produce the `ANONYMOUS_RECURSIVE_TYPE` diagnostic rather than silently collapsing.

## 003-json-schema-vocabulary

- Updated §5.5 to describe recursive `$defs` / `$ref` emission for named recursive types.
  - The prior diagnostic-only language now points to completed tracker [#105](https://github.com/mike-north/formspec/issues/105), not future work.
  - Anonymous recursive shapes now remain unsupported through a clear `ANONYMOUS_RECURSIVE_TYPE` diagnostic.

## 006-parity-testing

- Documented recursive named-type coverage as existing analyzer, generator, and CLI/e2e evidence rather than adding a strict TSDoc-to-ChainDSL parity fixture in this doc-only update.
- Refreshed parity-test organization examples to the package-level `tests/` layout introduced by PR #410.

## e2e-test-matrix

- Added recursive named-type coverage to the already-covered fixture list, backed by the existing `cli/circular-node` fixture and focused build tests.

## 000-principles.md

- Added PP14 — Deprecation over breaking changes ([#434](https://github.com/mike-north/formspec/issues/434)).
  - Deprecation with an aliased replacement is the default mechanism for evolving public APIs (TypeScript exports, ESLint rule IDs, configuration keys).
  - Removals land only in major releases; major releases are intentionally boring — they remove previously deprecated aliases and dead deprecation-support code, not introduce new behavior.
  - Documented exceptions for zero-user APIs, security/correctness fixes, and `@alpha`/`@beta` churn — the alpha/beta exception is currently load-bearing during pre-1.0 development (PP12) and should narrow as APIs stabilize.
  - CLAUDE.md gains a corresponding "Evolving the public API" section so contributors and AI agents internalize the principle when proposing API changes.
- Added a naming principle for TSDoc tags.
  - FormSpec TSDoc tags should read as complete thoughts, even when they are not full sentences.
  - Generic names like `@data` are disfavored when they obscure the primary meaning being captured at the comment site.
  - `@displayName` and `@apiName` are the canonical positive examples because the semantic role is explicit in the tag name itself.
- Clarified consumer control over inferred naming.
  - PP11 now explicitly covers inferred serialized names and display labels.
  - Name inference and plural inflection are consumer-configurable metadata-policy concerns rather than fixed global transforms.
- Refined PP5 and related wording.
  - PP5 now allows only explicitly enumerated parity exceptions.
  - The shared static feature set remains parity-bound; runtime-capable exceptions must be named explicitly in the spec.
  - Provenance examples and IR wording no longer mention decorator paths as active authoring surfaces.

## 001-canonical-ir.md

- Terminology tightened.
  - Generic phrases like "output keyword names" should be replaced with explicit JSON Schema terminology such as "JSON Schema custom-key names".
- Enum member metadata naming tightened.
  - `EnumMember.displayName` has been renamed to `EnumMember.label` in the IR sketch to avoid overloading the term "display name" across both annotation concepts and per-member stored metadata.
- Migration material moved out of the normative spec.
  - Section 11 has been removed from `001-canonical-ir.md`.
  - Its implementation-bridge content now lives in [maintainer-migration-notes.md](/Users/mnorth/Development/formspec/scratch/maintainer-migration-notes.md) as non-normative maintainer guidance.
- Added a normative resolved-metadata model.
  - Logical identifiers now remain distinct from output-facing names in the canonical spec.
  - `ResolvedMetadata` and metadata-policy resolution are specified for fields, object properties, named types, and the analyzed root declaration.
  - Mixed-authoring precedence for explicit vs inferred metadata is now recorded normatively.

## 002-tsdoc-grammar.md

- Resolved contradiction from `spec-risk-log.md` item 1.
  - Sections 5.5 and 9.4 are canonical.
  - `:member` syntax is only valid for string-literal unions.
  - `enum` and `const enum` must use declaration-site annotations.
  - The conflicting section 5.2 examples for `enum` / `const enum` should be removed or rewritten.
- Resolved contradiction from `spec-risk-log.md` item 2.
  - Validation tags may use path-target syntax when they target nested fields within a structured type.
  - For array-valued nested fields, this includes `@minItems`, `@maxItems`, and `@uniqueItems`.
  - Section 4.3 should be clarified so array-level constraints do not need path-target syntax on the array field itself, but may target an array-valued nested field via path-target syntax.
  - The spec should explicitly distinguish untargeted array constraints on an outer array field from path-targeted array constraints on an array-valued property of each array item.
  - Example:
    - `@minItems 1` on `orders: Order[]` constrains the number of `orders`
    - `@minItems :lineItems 1` constrains the `lineItems` array on every `Order` in `orders`
- Resolved contradiction from `spec-risk-log.md` item 3.
  - Diagnostic codes should be symbolic machine-readable identifiers only.
  - No numeric or vendor-prefixed diagnostic IDs.
  - 002 and 006 should use the same symbolic code scheme.
- Resolved ambiguity from `spec-risk-log.md` item 6.
  - The base spec should not promise cross-axis conditional combinations on a single field yet.
  - Normative behavior is restricted to one rule axis per field for now.
  - Cross-axis combinations are deferred to future work.
- Resolved ambiguity from `spec-risk-log.md` item 7.
  - Multiple `@description` tags use last-one-wins semantics.
  - 002 should state explicit override behavior for repeated `@description` tags.
- Resolved ambiguity from `spec-risk-log.md` item 8.
  - Class-level `@displayName` maps to the root schema `title`.
  - On classes/interfaces, bare `@displayName Foo` is the singular form and is equivalent to `@displayName :singular Foo`.
  - The root schema `title` uses the singular display name.
- Resolved ambiguity from `spec-risk-log.md` item 9.
  - `@deprecated` message text must be preserved.
  - The extracted message maps to the JSON Schema custom annotation `x-<vendor>-deprecation-description`.
- Resolved ambiguity from `spec-risk-log.md` item 10.
  - Quoted `@defaultValue` values are always explicit strings.
  - Unquoted values are parsed against the resolved target type, preferring a valid non-string interpretation before falling back to string.
  - This preserves a low-noise path for string defaults while keeping quoted syntax as the explicit string escape hatch.
- Resolved the shared `:` modifier syntax decision.
  - The spec keeps a single `:` syntax for path-targets, member-targets, and reserved qualifiers.
  - This is documented as an intentional limitation: each declaration surface must keep those modifier namespaces non-intersecting.
  - If a future feature creates a collision, the implementation should lint it and migrate authors to a new non-colliding syntax via a mechanical rewrite.
- Terminology tightened.
  - Generic labels like "Output keyword" should be replaced with explicit terms such as "JSON Schema annotation key", "JSON Schema validation keyword", or "UI Schema target" depending on what the column actually means.
- Runtime option tags clarified and renamed.
  - Superseded by a cleaner authoring boundary.
  - Built-in TSDoc tags for dynamic option retrieval have been removed from the spec.
  - Dynamic option retrieval, runtime-discovered schema, and runtime-discovered UI are ChainDSL-owned capabilities in this revision.
  - Mixed-authoring composition is the supported path when a mostly TSDoc-derived form needs ChainDSL-only runtime behavior.
  - Decorators are explicitly not the escape hatch for this capability.
- Clarified extension-example status for `@maxSigFig`.
  - Section 2.1 now treats `@maxSigFig` as a canonical example of an extension-defined constraint tag.
  - The file no longer implies that decimal precision tags are required built-ins of core FormSpec.
- Added a built-in declaration-level discriminator tag.
  - `@discriminator :fieldName T` is declared as a built-in tag on object-like classes, interfaces, and type aliases.
  - The target path is direct-property-only in v1.
  - The source operand must be a local type parameter identifier.
  - The tag specializes the targeted property's emitted schema to a singleton `enum` without introducing a new IR node kind.
- Aligned naming-tag semantics with metadata-policy resolution.
  - `@apiName` and `@displayName` are now specified as explicit metadata inputs to the resolved-metadata model rather than as always-on default transforms.
  - The default behavior is now explicit: no inferred serialized name or display label exists unless metadata policy opts into inference.
  - `@discriminator` resolution for named declarations now refers to resolved serialized names before falling back to logical identifiers.

## 003-json-schema-vocabulary.md

- Resolved drift from `spec-risk-log.md` item 5.
  - 003 is normative for `additionalProperties`.
  - Default output omits `additionalProperties: false` unless strict mode is explicitly configured.
- Resolved ambiguity from `spec-risk-log.md` item 9.
  - Deprecation message text is preserved in JSON Schema using the vendor-prefixed custom annotation `x-<vendor>-deprecation-description`.
  - `deprecated: true` remains the standard keyword; the custom annotation carries the descriptive message for SDK/tooling consumers.
- Terminology tightened.
  - Mapping tables should distinguish between JSON Schema validation keywords and JSON Schema annotation keys rather than using a generic "keyword" label.
- Runtime option annotation keys clarified and renamed.
  - The normative JSON Schema annotation keys for dynamic option retrieval remain `x-<vendor>-option-source` and `x-<vendor>-option-source-params`.
  - These keys are emitted by ChainDSL-authored dynamic fields, including mixed-authoring composition output, not by built-in TSDoc tags in this revision.
  - The spec states explicitly that option providers may be local or remote; the schema carries only the declarative provider key and parameter-field list.
- Added discriminator specialization to object lowering.
  - Declaration-level `@discriminator` rewrites only the targeted direct property to a singleton `enum`.
  - No custom vocabulary keyword, provenance marker, or special object schema kind was introduced.
- Aligned naming output with resolved metadata.
  - Property keys, `$defs` keys, and `$ref` targets now normatively reference `ResolvedMetadata` before falling back to logical identifiers.
  - Root/object titles now reference resolved `displayName` first, annotation-only data second, and are otherwise omitted unless policy resolves a title.

## 004-tooling.md

- Added declaration-level tooling coverage for `@discriminator`.
  - ESLint validation now includes declaration placement, duplicate detection, target-field validation, and local type-parameter validation for the discriminator surface.
  - The language server now needs tag completion, direct-property target completion, local type-parameter completion, and hover/signature help for the new tag.
- Reconciled the ESLint rule inventory.
  - `@description` validation now lives at `documentation/no-unsupported-description-tag`, while `constraint-validation/no-description-tag` remains a deprecated alias.
  - Chain DSL policy rules now live under `dsl-policy/allowed-field-types` and `dsl-policy/allowed-layouts`; the previous `constraints-allowed-*` IDs remain deprecated aliases.
  - The recommended preset includes the existing Markdown-formatting and DSL-policy rules, and stale `SYNTHETIC_SETUP_FAILURE` references were removed from 004's rule-category tables.

## 005-numeric-types.md

- No entries yet.

## 006-parity-testing.md

- Resolved contradiction from `spec-risk-log.md` item 3.
  - Diagnostic parity should compare symbolic machine-readable codes only.
  - No numeric or vendor-prefixed diagnostic IDs.
- Resolved ambiguity from `spec-risk-log.md` item 11.
  - Parity fixtures should first rewrite the TSDoc surface to get as close as possible to the chain DSL fixture.
  - Any remaining chain-only features should be reviewed explicitly to decide whether to remove them or add TSDoc support.
- Refined parity scope and test mechanics.
  - Parity now applies to the shared static feature set, with explicitly enumerated ChainDSL-only exceptions for runtime-capable behavior.
  - Mixed-authoring composition tests are separate from strict TSDoc ↔ ChainDSL parity tests.
  - Snapshot tests are no longer part of the normative parity strategy.
  - Diagnostic parity compares code and severity; message text is verified separately.
- Recorded `@discriminator` as a TSDoc-only exception for this revision.
  - There is no ChainDSL parity requirement for declaration-level discriminator specialization in v1.
  - If this changes later, the parity document should add an explicit shared-surface fixture track rather than implying equivalence by default.
- Clarified metadata-policy parity requirements.
  - TSDoc and chain-DSL parity fixtures that rely on inferred naming must run under the same normalized metadata policy.
  - Parity now explicitly covers resolved metadata, not only raw logical field/type identifiers.

## Matrix

- Resolved drift from `spec-risk-log.md` item 5.
  - Matrix examples that include `additionalProperties: false` without explicit strict-mode context should be corrected.
- Resolved ambiguity from `spec-risk-log.md` item 8.
  - Matrix expectations for class-level `@displayName` should treat the root schema `title` as the singular display name.
- Resolved ambiguity from `spec-risk-log.md` item 11.
  - `parity-contact-form` should be rewritten so the TSDoc side gets as close as possible to the chain DSL fixture before any parity judgment is made.
- Expanded the `path-target-expanded` fixture so it covers both:
  - outer-array constraints applied directly to an array field
  - nested array constraints applied via path-target to an array-valued property on each array item
- Added a mixed-authoring composition fixture track.
  - A mostly TSDoc-derived data model plus ChainDSL-only dynamic option fields must be tested as composition, not parity.
  - Matrix guidance now rejects checked-in gold masters for these cases in favor of hand-authored structural assertions.
- Added user-authored confidence test tracks.
  - The matrix now distinguishes data-model conformance tests from dynamic-option tests and dynamic-schema resolver tests.
  - These are explicitly framed as user integration-confidence tests rather than parity tests.

# 2026-03-29

## 002-tsdoc-grammar

- Removed `@description` tag from the DSL.
  - Not a standard TSDoc tag (JSDoc only); required custom `tsdoc.json` registration to pass API Extractor.
  - API Documenter silently drops it even when registered — invisible in generated docs.
  - Summary text (bare text before the first block tag) now populates JSON Schema `description` directly.
  - An `UNSUPPORTED_DESCRIPTION_TAG` diagnostic (error) is emitted when `@description` is used, with auto-fix to move content to summary position.
  - Per-member `@description :member` syntax on string literal unions is deferred — no replacement in this revision.
- Redefined `@remarks` role from `@description` fallback to a separate channel.
  - `@remarks` no longer populates JSON Schema `description`. It populates `x-<vendor>-remarks` instead.
  - SDK codegen can include `x-<vendor>-remarks` in doc comments; API Documenter renders source `@remarks` natively.
  - A `REMARKS_WITHOUT_SUMMARY` diagnostic (info; projected as ESLint `warn`) is emitted when `@remarks` is present but no summary text exists.
- Replaced `DESCRIPTION_REMARKS_CONFLICT` diagnostic with `REMARKS_WITHOUT_SUMMARY` and `UNSUPPORTED_DESCRIPTION_TAG`.
- Updated `DescriptionAnnotation` source note: now populated from TSDoc summary text rather than `@description` tag.
- Added `RemarksAnnotation` IR node mapping to `x-<vendor>-remarks`.

## 003-json-schema-vocabulary

- Added `x-<vendor>-remarks` custom annotation keyword (§3.2) for carrying `@remarks` content through JSON Schema.
- Updated annotation mapping table (§2.8): `DescriptionAnnotation` source note updated, `RemarksAnnotation` → `"x-<vendor>-remarks"` added.
- Removed `@description` from enum `oneOf[const]` note — per-member descriptions deferred.

## 001-canonical-ir

- Updated ecosystem tag alignment note: `description` now derives from TSDoc summary text, not `@description`/`@remarks`.

## 004-tooling

- Replaced `DESCRIPTION_REMARKS_CONFLICT` check with `REMARKS_WITHOUT_SUMMARY` and `UNSUPPORTED_DESCRIPTION_TAG` checks.
- Updated auto-fix table: `@description` auto-fix moves content to summary position.

## e2e-test-matrix

- Rewrote `annotations-description` fixture to use summary text instead of `@description`.
- Updated test assertions: summary → `description`, `@remarks` → `x-<vendor>-remarks`, no `@description` fallback.

# 2026-03-26

## 001-canonical-ir

- Superseded the prior circular-reference decision from 2026-03-25.
  - Circular references are now supported in the canonical IR and downstream JSON Schema emission.
  - Recursive named types emit stable `$defs` / `$ref` structures instead of failing with a diagnostic.

## 003-json-schema-vocabulary

- Superseded the prior circular-reference note from 2026-03-25.
  - Recursive named-type graphs are now supported through recursive `$defs` / `$ref` emission.
  - Circular references are no longer treated as a diagnostic-only gap in the current product revision.

# 2026-03-25

## 001-canonical-ir

- Added first-class `integer` and `bigint` primitive kinds to the canonical IR.
- Updated numeric constraint nodes to allow exact string-valued literals for bigint-origin constraints.
- Resolved circular references for the current revision: reject them with a diagnostic for now; future recursive `$ref` support is tracked in [#105](https://github.com/mike-north/formspec/issues/105).
- Resolved object-key pattern support in favor of structural `patternProperties` on object types rather than treating object-key patterns as string-value constraints.

## 002-tsdoc-grammar

- Clarified that there is still no `@integer` tag, but integer is now a first-class canonical type and TSDoc commonly reaches it through `number` plus `@multipleOf 1`.
- Fixed the quick-reference table so it matches the normative member-target and path-target rules:
  - `@minItems`, `@maxItems`, and `@uniqueItems` allow path targeting.
  - `@apiName` and `@description` allow member targeting.
  - `@defaultValue` does not allow member targeting.
- Resolved multi-level path targeting in favor of dot-separated paths like `:address.street`.
- Resolved `@displayName` on classes/interfaces to singular-only. Plural display-name variants remain supported on array fields, but not on classes, interfaces, or type aliases in this revision.

## 003-json-schema-vocabulary

- Added explicit primitive-type rows for `integer` and `bigint`.
- Clarified that `number + @multipleOf 1` is a canonicalization path to integer, not merely an output quirk.
- Documented `x-<vendor>-schema-source` as an explicit exception to strict `additionalProperties: false` emission.
- Updated extension applicability language so built-in numeric constraints apply to `number`, `integer`, and `bigint`.
- Aligned the circular-reference section with the current product decision: circular graphs are a diagnostic for now, with future recursive `$ref` support tracked in [#105](https://github.com/mike-north/formspec/issues/105).
- Made object-key mapping explicit:
  - unconstrained records/index signatures -> `additionalProperties`
  - finite constrained key sets -> explicit `properties`
  - pattern-shaped constrained key families -> `patternProperties`

## 004-tooling

- Narrowed member-target completion wording to string-literal union members only.

## 005-numeric-types

- Reworked the numeric model around first-class support for `integer`.
- Kept `number + @multipleOf 1` as the canonical TSDoc authoring example that derives integer semantics.
- Added support language for `bigint` as an authoring-side integer surface.
- Replaced Ajv-specific runtime-validation guidance with validator-agnostic guidance that matches the current `@cfworker/json-schema` direction.
- Aligned extension-tag authoring guidance so `defineConstraintTag` is the primary path and custom ESLint rules are optional for richer domain-specific checks.

## 006-parity-testing

- Updated parity fixture prose so integer fixtures describe canonical integer semantics instead of treating integer as a number-only output optimization.
- Standardized referenced-type defaults on direct `$ref` with sibling `default`.

## e2e-test-matrix

- Removed the remaining gold-master wording.
- Rephrased alias-chain expectations as normative `$defs`/`$ref` expectations.
- Standardized referenced-type defaults on direct `$ref` with sibling `default`.
