# 003 — JSON Schema Vocabulary

This document specifies how FormSpec's canonical IR maps to JSON Schema 2020-12 keywords, what custom vocabulary keywords are required and how they are named, and how validator/runtime consumers interact with those keywords.

---

## 1. Overview

### Principles Satisfied

| Principle                                          | How this document satisfies it                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PP6** (JSON Schema as normative output)          | All generated output targets JSON Schema 2020-12. The meta-schema validates every generated document. Custom keywords are declared as a proper vocabulary                          |
| **PP7** (High-fidelity JSON Schema output)         | Named types are emitted as `$defs` with `$ref`. Custom keywords are emitted as proper namespaced vocabulary members rather than undocumented metadata. The output works standalone |
| **E3** (Custom vocabulary keywords are namespaced) | All custom keywords use a configurable `x-<vendor>-` prefix (default `x-formspec-`). The vocabulary URI also includes the vendor prefix                                            |
| **PP10** (White-labelable)                         | The vendor prefix, vocabulary URI, and `$schema` annotation are all configurable. No hard-coded "formspec" strings appear in generated output when the vendor is overridden        |
| **PP9** (Configurable surface area)                | Custom keywords that represent features disabled by project configuration are not emitted                                                                                          |
| **B3** (Lossy transformations are configurable)    | Extension-defined precision keywords (e.g., `maxSigFig`) must support configurable precision-loss policies; the default should reject, not silently round                          |
| **B4** (JSON Schema is the contract boundary)      | The IR is the source of truth; the JSON Schema is derived from it. If they disagree, fix the generator                                                                             |
| **S1** (Specialization narrows)                    | `allOf` composition preserves and narrows constraints when types specialize                                                                                                        |
| **PP2** (Inference over declaration)               | Standard JSON Schema keywords are inferred from TypeScript types without requiring author annotation where possible                                                                |

### Relationship to 001 (Canonical IR)

JSON Schema generation is a pure function of the canonical IR (A3). This document specifies the mapping from each IR node kind to JSON Schema keywords. The generator never consults the TypeScript AST or surface syntax directly — only the IR.

Naming-sensitive output is resolved from the IR's `ResolvedMetadata`, not from raw annotations or declaration identifiers alone. In particular:

- object property keys use `ResolvedMetadata.apiName` when present, otherwise the logical property name
- `$defs` keys and `$ref` targets use the resolved singular API name for the referenced type when present, otherwise the logical type name
- root/object titles use resolved `displayName` when present; legacy or noncanonical title annotations are only a fallback when resolved metadata is absent, and otherwise titles are omitted unless a consumer-supplied policy resolves one

### JSON Schema Draft

FormSpec targets **JSON Schema 2020-12** (`https://json-schema.org/draft/2020-12/schema`). The `$schema` keyword in every generated root schema is set to the 2020-12 URI.

**Note on current implementation:** The existing `@formspec/build` generator currently targets draft-07. Migration to 2020-12 is required as part of implementing this design. The key behavioral differences are: `exclusiveMinimum`/`exclusiveMaximum` are numeric in 2020-12 (they were boolean flags in draft-04/draft-06 and numeric in draft-07; the 2020-12 behavior matches draft-07, so no change needed here). The `contains` keyword and `$defs` (replacing `definitions`) are standard in 2020-12.

---

## 2. Mapping from Canonical IR to Stock JSON Schema Keywords

### 2.1 Primitive Types

| IR type                                           | JSON Schema output                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `string`                                          | `{ "type": "string" }`                                                                                                                                                                    |
| `number`                                          | `{ "type": "number" }`                                                                                                                                                                    |
| `integer`                                         | `{ "type": "integer" }`                                                                                                                                                                   |
| `bigint`                                          | `{ "type": "integer" }` (schema-level integer semantics; runtime transport/serialization is outside the JSON Schema contract)                                                             |
| `number` with `MultipleOfConstraint { value: 1 }` | `{ "type": "integer" }` (the canonicalization pipeline recognizes this common TypeScript authoring pattern and emits integer semantics; the redundant `multipleOf: 1` keyword is omitted) |
| `boolean`                                         | `{ "type": "boolean" }`                                                                                                                                                                   |
| `null`                                            | `{ "type": "null" }`                                                                                                                                                                      |
| `undefined`                                       | Not emitted (optionality is expressed via `required`, per S8)                                                                                                                             |
| `unknown` / `any`                                 | `{}` (accepts any value)                                                                                                                                                                  |
| `never`                                           | `{ "not": {} }`                                                                                                                                                                           |

### 2.2 String Literal, Number Literal, Boolean Literal

| IR type                | JSON Schema output   |
| ---------------------- | -------------------- |
| String literal `"foo"` | `{ "const": "foo" }` |
| Number literal `42`    | `{ "const": 42 }`    |
| Boolean literal `true` | `{ "const": true }`  |

### 2.3 Union Types

| IR union pattern                         | JSON Schema output                              |
| ---------------------------------------- | ----------------------------------------------- |
| String literal union `"a" \| "b" \| "c"` | `{ "enum": ["a", "b", "c"] }`                   |
| Number literal union `1 \| 2 \| 3`       | `{ "enum": [1, 2, 3] }`                         |
| Nullable type `T \| null`                | `{ "oneOf": [<T schema>, { "type": "null" }] }` |
| Heterogeneous union `A \| B`             | `{ "oneOf": [<A schema>, <B schema>] }`         |
| Boolean shorthand (`true \| false`)      | `{ "type": "boolean" }` (not `oneOf`)           |

**Note on `enum` vs `oneOf[const]`:** Static enums support two JSON Schema encodings. The default is flat `enum` plus a vendor extension carrying display names. Callers may opt into `oneOf` with per-member `const`/`title` instead.

Default `enum` encoding:

```json
{
  "enum": ["draft", "sent", "paid"],
  "x-formspec-display-names": {
    "draft": "Draft Invoice",
    "sent": "Sent to Customer",
    "paid": "Paid in Full"
  }
}
```

If any member has a resolved display name, the extension contains a complete set of labels, filling missing members with `String(enumValue)`. When callers select `oneOf`, each branch is emitted as `{ "const": value, "title": displayName ?? String(value) }`.

### 2.4 Array Types

| IR node                  | JSON Schema output                                                    |
| ------------------------ | --------------------------------------------------------------------- |
| `T[]`                    | `{ "type": "array", "items": <T schema> }`                            |
| Tuple `[A, B, C]`        | `{ "type": "array", "prefixItems": [<A>, <B>, <C>], "items": false }` |
| `minItems` constraint    | `"minItems": n` added to array schema                                 |
| `maxItems` constraint    | `"maxItems": n` added to array schema                                 |
| `uniqueItems` constraint | `"uniqueItems": true` added to array schema                           |

### 2.5 Object Types

| IR node                                                                                      | JSON Schema output                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Object with known properties                                                                 | `{ "type": "object", "properties": {...}, "required": [...] }`         |
| Required property                                                                            | Listed in `"required"` array                                           |
| Optional property                                                                            | Absent from `"required"` array                                         |
| Index signature `{ [k: string]: T }`                                                         | `{ "type": "object", "additionalProperties": <T schema> }`             |
| `Record<string, T>` / unconstrained string key type                                          | `{ "type": "object", "additionalProperties": <T schema> }`             |
| Finite constrained key set (e.g. `Record<'a' \| 'b', T>`, `Record<keyof SomeFiniteType, T>`) | Expanded to ordinary `"properties"` and `"required"` entries           |
| Pattern-shaped constrained key type (e.g. `Record<\`env\_${string}\`, T>`)                   | `{ "type": "object", "patternProperties": { "<regex>": <T schema> } }` |
| Mixed (known + index signature)                                                              | `"properties"` + `"additionalProperties"` combined                     |
| Mixed (known + constrained key family)                                                       | `"properties"` + `"patternProperties"` combined                        |

**`additionalProperties` policy:** When a TypeScript type has only known properties and no index signature, `additionalProperties` is **not** set to `false` by default. Setting it to `false` would cause validation failures when form renderers add extra fields (e.g., `_id`, `_timestamp`). This is intentional and matches B4 (the JSON Schema represents the data contract, not the full TypeScript structural check).

**DECIDED:** The `additionalProperties` policy is configurable. Projects can set `schema.additionalProperties: "strict" | "allow"` in their FormSpec configuration. `"allow"` (the default) omits `additionalProperties`; `"strict"` sets it to `false` on all generated object schemas. This is a PP9-style constraint setting.

**Constrained key-type rule:** FormSpec derives object-key behavior from what TypeScript can actually express:

- Unconstrained string/number index signatures become `additionalProperties`
- Finite key sets become explicit named `properties`
- Pattern-shaped key families become `patternProperties`

FormSpec does **not** promise arbitrary regex-to-TypeScript or TypeScript-to-regex equivalence. `patternProperties` is limited to the subset of key constraints that can be expressed clearly and canonically in TypeScript, primarily template-literal key families and similarly unambiguous constrained key types.

### 2.6 Numeric Constraints

| IR constraint                                           | JSON Schema validation keyword                                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NumericBoundConstraint { bound: "minimum" }`           | `"minimum"`                                                                                                                                                                                               |
| `NumericBoundConstraint { bound: "maximum" }`           | `"maximum"`                                                                                                                                                                                               |
| `NumericBoundConstraint { bound: "exclusive-minimum" }` | `"exclusiveMinimum"`                                                                                                                                                                                      |
| `NumericBoundConstraint { bound: "exclusive-maximum" }` | `"exclusiveMaximum"`                                                                                                                                                                                      |
| `MultipleOfConstraint`                                  | `"multipleOf"` (when the resolved type is integer and the only source of that integer semantic is `value = 1` on a `number`-derived alias, the redundant `"multipleOf": 1` keyword is omitted — see §2.1) |

### 2.7 String Constraints

| IR constraint                                   | JSON Schema validation keyword |
| ----------------------------------------------- | ------------------------------ |
| `StringLengthConstraint { bound: "minLength" }` | `"minLength"`                  |
| `StringLengthConstraint { bound: "maxLength" }` | `"maxLength"`                  |
| `PatternConstraint`                             | `"pattern"`                    |
| `FormatAnnotation`                              | `"format"`                     |

### 2.8 Metadata and Annotation → JSON Schema Annotation Keywords

| IR metadata or annotation      | JSON Schema annotation key                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `ResolvedMetadata.displayName` | `"title"`                                                                                  |
| `DescriptionAnnotation`        | `"description"` — populated from TSDoc summary text (bare text before first block tag)     |
| `RemarksAnnotation`            | `"x-<vendor>-remarks"` — programmatic-persona documentation from `@remarks`                |
| `DefaultValueAnnotation`       | `"default"`                                                                                |
| `ExampleAnnotation[]`          | `"examples"` (array)                                                                       |
| `DeprecatedAnnotation`         | `"deprecated": true` plus `"x-<vendor>-deprecation-description"` when a message is present |
| `ReadOnlyAnnotation`           | `"readOnly"`                                                                               |
| `WriteOnlyAnnotation`          | `"writeOnly"`                                                                              |
| `ConstConstraint`              | `"const"`                                                                                  |

### 2.9 Declaration-Level Discriminator Specialization

`@discriminator` is not represented as a custom JSON Schema keyword. It is declaration-level metadata that influences lowering of an object-like schema only at the targeted direct property.

For a declaration like:

```typescript
/** @discriminator :kind T */
interface TaggedValue<T> {
  kind: string;
  id: string;
  url: string;
}
```

if `T` resolves to the discriminator value `"customer"`, the generated schema is the ordinary object schema with only `kind` specialized to a one-element enum:

```json
{
  "type": "object",
  "properties": {
    "kind": { "enum": ["customer"] },
    "id": { "type": "string" },
    "url": { "type": "string" }
  },
  "required": ["kind", "id", "url"]
}
```

The rest of the object schema remains unchanged. No special object kind, discriminator annotation key, or provenance marker is emitted. Nested path targets are out of scope for v1; the target must be a direct property, and the source operand must resolve to a single local type parameter.

---

## 3. Custom Vocabulary Keywords

### 3.1 Vendor Prefix Configuration

All FormSpec custom keywords use the shape `x-<vendor>-<local-name>`, where `<local-name>` is kebab-case. The default vendor segment is `formspec`. Organizations override the vendor segment via project configuration:

```yaml
# .formspec.yml
schema:
  vendorPrefix: "x-stripe" # yields keywords like "x-stripe-option-source"
```

Throughout this document, the placeholder `<vendor>` represents the vendor segment that appears between `x-` and the next dash. For example, `x-formspec-option-source` uses `<vendor> = formspec`, and `x-stripe-option-source` uses `<vendor> = stripe`.

The vocabulary URI also includes the vendor prefix:

- Default: `https://formspec.dev/vocab/x-formspec`
- With override: `https://formspec.dev/vocab/x-stripe`

**DECIDED:** The vocabulary URI is fully configurable. Organizations can override the entire URI in configuration (not just the prefix portion), enabling internal registries and documentation URLs. The default is derived from the vendor prefix (e.g., `https://formspec.dev/vocab/x-formspec`).

### 3.2 Built-in Custom Annotation Keywords

FormSpec ships a small set of built-in custom annotation keywords. Some support chain-DSL-authored runtime-capable fields, while others preserve metadata needed by downstream tooling such as SDK generators.

#### `x-<vendor>-option-source`

**Type:** string
**Applies to:** `{ "type": "string" }` schemas
**Semantics:** The value is an option-provider key registered in the runtime option registry. At runtime, a renderer/client uses this key to obtain the available selectable options for the field.
**Provider model:** The option provider may be local (for example, filtering a statically known list) or remote (for example, calling a service). The schema carries only the provider key; it does not encode whether the provider is local or remote.
**Contract boundary:** This key is declarative metadata. It identifies which option provider to use, but it does not by itself define the runtime resolver registry, transport, invocation lifecycle, or returned option payload shape.
**Authoring-surface note:** This key is emitted by chain-DSL-authored dynamic option fields, including mixed-authoring composition where a dynamic field is layered onto an otherwise TSDoc-derived data model. There is no built-in TSDoc tag that emits this key in this revision.
**Validation behavior:** Annotation-only. It does not constrain the value at validation time; the keyword carries its value as an annotation for runtime use.

Example:

```json
{
  "type": "string",
  "x-formspec-option-source": "countries"
}
```

#### `x-<vendor>-option-source-params`

**Type:** `string[]`
**Applies to:** Schemas that also carry `x-<vendor>-option-source`
**Semantics:** An ordered list of field names whose current values are passed as parameters to the option provider at runtime.
**Contract boundary:** This key only names the sibling fields whose values must be supplied to the option provider. It does not define how those values are collected, memoized, or transported.
**Authoring-surface note:** This key follows the same authoring boundary as `x-<vendor>-option-source`: ChainDSL and mixed-authoring composition only, not built-in TSDoc tags.
**Validation behavior:** Annotation-only.

Example:

```json
{
  "type": "string",
  "x-formspec-option-source": "cities",
  "x-formspec-option-source-params": ["country"]
}
```

#### `x-<vendor>-schema-source`

**Type:** string
**Applies to:** `{ "type": "object" }` schemas
**Semantics:** The key for a runtime schema provider that returns the full JSON Schema for this field's value.
**Validation behavior:** Annotation-only. Because the actual object shape is runtime-determined, schemas carrying this key are an explicit exception to project-wide strict `additionalProperties: false` emission.

**Authoring-surface note:** This key is chain-DSL-only in this revision. It may appear in mixed-authoring composition output, but it does not have a built-in TSDoc tag equivalent.

#### `x-<vendor>-deprecation-description`

**Type:** string
**Applies to:** Schemas that also carry `"deprecated": true`
**Semantics:** Carries the human-readable deprecation explanation from `@deprecated` text so SDK generators, documentation generators, and other tooling can surface richer guidance.
**Validation behavior:** Annotation-only.

Example:

```json
{
  "type": "string",
  "deprecated": true,
  "x-formspec-deprecation-description": "Use paymentMethod instead"
}
```

#### `x-<vendor>-remarks`

**Type:** string
**Applies to:** Any schema that also carries a `"description"` or could benefit from supplementary documentation
**Semantics:** Carries the programmatic-persona documentation from `@remarks`. SDK generators can include this in doc comments alongside the `description`. API Documenter renders the source `@remarks` natively in a dedicated Remarks section; this keyword ensures the same content is available to consumers of the JSON Schema (e.g., OpenAPI codegen).
**Validation behavior:** Annotation-only.

Example:

```json
{
  "type": "string",
  "description": "The customer's primary email address.",
  "x-formspec-remarks": "Must conform to RFC 5322. Used for transactional notifications including password resets and billing updates."
}
```

### 3.3 Extension-Defined Vocabulary Keywords (e.g., Decimal Precision)

FormSpec does not ship built-in decimal or precision vocabulary keywords. Instead, the `@maxSigFig` tag and its corresponding JSON Schema keyword are designed to be introduced by downstream consumers via the extension API (E1, E5). This is an intentional extensibility pressure test — a consumer defining a decimal type must be able to:

1. Register a custom vocabulary keyword (e.g., `x-<vendor>-max-sig-fig`) with its JSON Schema type, applicable types, and validation semantics
2. Broaden the `@maxSigFig` TSDoc tag to apply to their custom decimal type (see 002 §2.1)
3. Provide validator/runtime integration for that keyword when needed (see §8)
4. Have the generator emit the keyword in the JSON Schema output when the tag is present

This pattern applies to any domain-specific vocabulary keyword — decimal precision is just the motivating example. The extension registration interface (see 001 §9) provides the hooks for all four steps.

**Note:** `x-<vendor>-max-sig-fig` (when registered) is a validation keyword, not an annotation keyword. It affects whether a value is accepted by a validator that implements it. This distinguishes it from `x-<vendor>-option-source` and `x-<vendor>-option-source-params`, which are annotation-only.

### 3.4 Extension Keywords

Extension-defined annotations emit extension keywords. The naming convention is:

```
x-<vendor>-<extension-name>
```

For example, a `sensitive` extension emits `x-formspec-sensitive` (or `x-stripe-sensitive` with a configured prefix).

Extension keywords are always annotation-only unless the extension also provides validator/runtime support. Per E2, extensions must declare whether their keywords are validation keywords or annotation keywords at registration time.

---

## 4. Validation Keywords vs Annotation Keywords

JSON Schema 2020-12 distinguishes between keywords that affect validation and keywords that carry annotations. FormSpec aligns with this distinction.

### 4.1 Validation Keywords

These keywords determine whether a value is valid. A validator that understands such a keyword uses it to participate in acceptance or rejection of instance data.

FormSpec core ships no built-in custom validation keywords. Extension packages may define validation keywords (e.g., `x-<vendor>-max-sig-fig` for decimal precision) via the extension API (see §3.3 and §8.3).

Standard 2020-12 validation keywords used by FormSpec:

- `type`, `enum`, `const`, `oneOf`
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- `minLength`, `maxLength`, `pattern`, `format`
- `minItems`, `maxItems`, `uniqueItems`
- `required`, `properties`, `additionalProperties`
- `$ref`, `allOf`

### 4.2 Annotation Keywords

These keywords carry metadata that downstream consumers (form renderers, documentation generators, developer tools) use, but their presence does not affect whether a value is valid.

FormSpec custom annotation keywords:

- `x-<vendor>-option-source`
- `x-<vendor>-option-source-params`
- `x-<vendor>-schema-source`
- `x-<vendor>-deprecation-description`
- `x-<vendor>-remarks`
- Extension-specific keywords (unless the extension registers a validator)

The first three may be absent from purely TSDoc-authored forms because their built-in authoring surface is ChainDSL or mixed-authoring composition rather than TSDoc comments.
The declaration-level discriminator specialization in §2.9 does not use a custom keyword and therefore does not appear in this list.

Standard annotation keywords used by FormSpec:

- `title`, `description`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`
- `$comment` (for internal generator notes, not consumer-facing)

### 4.3 The Constraint vs Annotation Model in IR

The IR's constraint/annotation distinction (C1) maps cleanly to JSON Schema's validation/annotation keyword distinction:

| IR kind          | JSON Schema kind   | Composition rule              |
| ---------------- | ------------------ | ----------------------------- |
| `ConstraintNode` | Validation keyword | Intersection (all must pass)  |
| `AnnotationNode` | Annotation keyword | Override (most-specific wins) |

There is one exception: `DeprecatedAnnotation` is an annotation in the IR (it does not narrow the valid value set) but is expressed as `"deprecated": true` in the schema. Deprecated fields remain valid; the deprecation is advisory only.

---

## 5. Named Type Representation

### 5.1 Why `$defs` with `$ref`

Per PP7, named TypeScript types (interfaces, type aliases, classes) must appear in the JSON Schema as `$defs` entries with `$ref` rather than being inlined at each use site. This preserves two important properties:

1. **Reusability:** A `MonetaryAmount` type used on 15 fields appears once in `$defs` and is referenced 15 times with `$ref`. This makes the schema more readable and reduces output size.

2. **Fidelity:** The distinction between "this field's type is the reusable `Address` interface" and "this field's type is an anonymous object with the same shape as `Address`" is visible in the output. Downstream tools that generate documentation, SDK code, or migrations can use this information.

### 5.2 When to Use `$defs`

**All named types are represented as `$defs` entries and referenced via `$ref`.** If a type has an explicit name (`interface Foo`, `type Foo = ...`, `class Foo`), it appears in `$defs`. The motivation is high-fidelity output (PP7) — a named type is a meaningful abstraction the author chose to create. Inlining it erases that information and makes the JSON Schema a less faithful representation of the TypeScript source.

A TypeScript type is **not** lifted to `$defs` when:

- It is an anonymous inline type literal (e.g., the type of a variable initialized with `{ x: number, y: number }`)
- It is a primitive type, literal, union of literals, or array of primitives
- It is one of TypeScript's built-in utility types (`Partial<T>`, `Required<T>`, etc.) — these are structurally expanded

### 5.3 `$defs` Structure

All `$defs` entries are placed at the root schema level. Nested schemas do not have their own `$defs`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "billingAddress": { "$ref": "#/$defs/Address" },
    "shippingAddress": { "$ref": "#/$defs/Address" }
  },
  "required": ["billingAddress"],
  "$defs": {
    "Address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" },
        "city": { "type": "string" },
        "country": { "type": "string" }
      },
      "required": ["street", "city", "country"]
    }
  }
}
```

### 5.4 Subfield Constraints and `$defs`

When an author applies subfield constraints (via `@minimum :value 0` on a `MonetaryAmount` field — see document 002 §4), the generator must decide whether to:

**Option A: Sibling keywords alongside `$ref`** — emit the `$ref` with the refinement keywords as siblings of the reference:

```json
{
  "$ref": "#/$defs/MonetaryAmount",
  "properties": {
    "value": { "minimum": 0 }
  }
}
```

**Option B: Derived `$defs` entry** — create a new named `$defs` entry (e.g., `MonetaryAmount_constrained_discount`) that composes the base type with the refinements.

**Decision: Option A (sibling keywords alongside `$ref`) is the default.** Option B is reserved for future work when multiple fields share the same constraint profile and deduplication is beneficial. Option A is simpler, more readable, and correctly represents that the constraints are field-specific, not type-specific.

Sibling keywords alongside `$ref` are standard JSON Schema 2020-12. Draft 2019-09 changed `$ref` so it no longer ignores adjacent keywords — the `$ref` and its siblings are evaluated together. Standards-compliant 2020-12 validators honor both halves. This is also the shape that downstream renderers expect: wrapping in `allOf` adds a layer of composition that many renderers do not unwrap, resulting in the constraints being silently dropped from the rendered view.

### 5.5 Circular Reference Handling

Named recursive type graphs are supported through the same `$defs` + `$ref` mechanism used for other named references. The canonical IR registry contains one entry for each named recursive type, and recursive back-edges inside that entry lower to `$ref` values that point back to the same `$defs` key.

For example, a named recursive type:

```typescript
export class CircularNode {
  id!: string;
  next?: CircularNode;
}

export class CircularForm {
  node!: CircularNode;
}
```

emits one reusable definition and references it from both the root field and the recursive property:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "node": { "$ref": "#/$defs/CircularNode" }
  },
  "required": ["node"],
  "$defs": {
    "CircularNode": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "next": { "$ref": "#/$defs/CircularNode" }
      },
      "required": ["id"]
    }
  }
}
```

This supersedes the prior diagnostic-only circular-reference rule tracked by [issue #105](https://github.com/mike-north/formspec/issues/105), which was completed by recursive named-type support. Anonymous recursive shapes remain unsupported until they can produce a clear `ANONYMOUS_RECURSIVE_TYPE` diagnostic; that follow-up is tracked in [issue #422](https://github.com/mike-north/formspec/issues/422).

---

## 6. Decimal and Precision — Extensibility Acceptance Criteria

FormSpec does not ship built-in decimal types or precision vocabulary keywords. Decimal is a downstream concern (see 002 §2.1). This section defines the **specific outcomes** that the extension API must make possible, using decimal as the motivating example. These serve as acceptance criteria for the extensibility story (E1, E4, E5).

### 6.1 Required Outcomes

A downstream consumer introducing a `Decimal` type must be able to achieve all of the following without forking FormSpec core:

**Outcome 1: Define a custom type that participates in the type system.**
The consumer defines `type Decimal = string` (or a branded string type). FormSpec's analyzer recognizes it as a registered extension type. Fields of type `Decimal` are extracted and included in the IR and generated JSON Schema.

**Outcome 2: Broaden existing built-in constraint tags to apply to the custom type.**
Built-in tags like `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, and `@multipleOf` — which FormSpec ships for `number`, `integer`, and `bigint` — must also become applicable to `Decimal` fields. The extension declares this broadening; FormSpec's analyzer and ESLint rules respect it. Applying `@minimum 0` to a `Decimal` field is valid, not a type-compatibility error.

**Outcome 3: Introduce a new custom constraint tag.**
The consumer introduces `@maxSigFig` as a new constraint tag. It is set-influencing (narrows the valid value set) and composes via intersection (C1) — if a base type declares `@maxSigFig 8` and a derived type declares `@maxSigFig 4`, the result is `@maxSigFig 4`. An attempt to broaden (`@maxSigFig 12` on a type inheriting `@maxSigFig 8`) is a contradiction error (S1, S2).

**Outcome 4: Write ESLint rules with minimal boilerplate.**
The consumer writes ESLint rules for `Decimal` and `@maxSigFig` by expressing only the extension-specific logic — which types the tag applies to, what values are valid, what contradictions look like. FormSpec provides foundational rule infrastructure: tag-on-type validation, contradiction detection for set-influencing constraints, path-target resolution, provenance tracking. The consumer should not have to reimplement any of this.

**Outcome 5: Custom vocabulary keyword in JSON Schema output.**
The generator emits `x-<vendor>-max-sig-fig` as a custom vocabulary keyword in the JSON Schema output. The keyword is namespaced per E3 and participates in validation when a validator/runtime integration implements it.

```json
{
  "type": "string",
  "x-stripe-max-sig-fig": 8,
  "x-stripe-minimum": "0"
}
```

**Outcome 6: Validator/runtime support for custom validation keywords.**
The consumer provides validator/runtime support for `x-<vendor>-max-sig-fig` when runtime enforcement is required. This integration is isolated in the consumer's package — it does not pollute FormSpec core's dependency graph (A8).

**Outcome 7: Constraint inheritance works identically to built-in types.**
Type alias chains work the same way as built-in types (PP3):

```typescript
/** @maxSigFig 8 */
type Decimal8 = Decimal;

/** @minimum 0 */
type PositiveDecimal8 = Decimal8; // inherits @maxSigFig 8

interface Invoice {
  /** @maximum 999999.99 */
  total: PositiveDecimal8; // inherits @minimum 0, @maxSigFig 8
}
```

**Outcome 8: Configurable lossy transformation policy.**
The extension can register a configurable policy for precision-loss behavior (B3):

```yaml
# Consumer's .formspec.yml
extensions:
  decimal:
    precisionLoss: "error" # default: fail on any precision loss
    # precisionLoss: "warn"  # emit warning but continue
    # precisionLoss: "allow" # allow silently (not recommended for financial contexts)
```

### 6.2 What This Validates

If all eight outcomes are achievable, the extension API satisfies E1 ("built-in types use the same extension API") — a downstream type with custom constraints, custom vocabulary keywords, and custom ESLint rules gets the same treatment as if it were built into FormSpec. This is the primary extensibility litmus test for the project.

---

## 7. Reuse Patterns

### 7.1 `$ref` for Named Types

As described in §5, named types use `$ref` to the `$defs` entry:

```json
{ "$ref": "#/$defs/Address" }
```

### 7.2 Sibling Keywords for Progressive Refinement

When subfield constraints are applied to a `$ref`-based field, the generator emits the refinement keywords as siblings of the `$ref` — not wrapped in an `allOf`:

```typescript
interface BaseAmount {
  value: number;
  currency: string;
}

interface Invoice {
  /** @minimum :value 0 */
  total: BaseAmount;
}
```

```json
{
  "$ref": "#/$defs/BaseAmount",
  "properties": {
    "value": { "minimum": 0 }
  }
}
```

Sibling keywords are the canonical shape for `$ref` refinements in 2020-12 (see §5.4). `allOf` is reserved for composition cases that cannot be expressed as siblings — for example, when the base schema itself is already an `allOf` that must be extended.

### 7.3 `oneOf` for Discriminated Unions

Discriminated unions are emitted as `oneOf` with a `required` discriminant in each branch:

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };
```

```json
{
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "const": "circle" },
        "radius": { "type": "number" }
      },
      "required": ["kind", "radius"]
    },
    {
      "type": "object",
      "properties": {
        "kind": { "const": "rectangle" },
        "width": { "type": "number" },
        "height": { "type": "number" }
      },
      "required": ["kind", "width", "height"]
    }
  ]
}
```

**DECIDED:** Discriminated unions with named member types lift each branch to `$defs` and reference them in `oneOf`. If a union member's type is a named TypeScript interface or type alias, the generator emits a `$defs` entry for it and uses `$ref` in the `oneOf` branch. This follows from PP7 (high-fidelity output) — named types are meaningful abstractions that should be preserved in the schema.

```json
{
  "oneOf": [{ "$ref": "#/$defs/Circle" }, { "$ref": "#/$defs/Rectangle" }],
  "$defs": {
    "Circle": {
      "type": "object",
      "properties": {
        "kind": { "const": "circle" },
        "radius": { "type": "number" }
      },
      "required": ["kind", "radius"]
    },
    "Rectangle": {
      "type": "object",
      "properties": {
        "kind": { "const": "rectangle" },
        "width": { "type": "number" },
        "height": { "type": "number" }
      },
      "required": ["kind", "width", "height"]
    }
  }
}
```

### 7.4 `anyOf` for Non-Discriminated Unions

Unions that are not discriminated (no common property that identifies the branch) use `anyOf` rather than `oneOf`, since `oneOf` requires exactly one branch to match and this may not hold for structural types:

**DECIDED:** Default to `anyOf` for non-discriminated unions. Use `oneOf` only for discriminated unions (detectable by a shared required property with distinct `const` values) and string/number literal unions (where members are mutually exclusive by value). TypeScript unions are structural, not nominal — a value can satisfy multiple branches simultaneously, making `oneOf` (which requires _exactly one_ match) incorrect for non-discriminated unions.

---

## 8. Validator Integration Strategy

### 8.1 Default FormSpec Validator Behavior

FormSpec's default validator package is [@formspec/validator](/Users/mnorth/Development/formspec/packages/validator), which is backed by `@cfworker/json-schema`. This validator ignores unknown `x-*` extension keywords by default, so annotation keys such as `x-formspec-option-source`, `x-formspec-option-source-params`, `x-formspec-schema-source`, and `x-formspec-deprecation-description` require no extra registration to coexist with validation.

Consumers who only need schema generation do not need the validator package at all (per A7).

```typescript
import { createFormSpecValidator } from "@formspec/validator";

const validator = createFormSpecValidator(myFormSchema);
const result = validator.validate(userData);
```

### 8.2 Annotation Keyword Handling

Annotation keywords are carried through the schema as namespaced JSON Schema vocabulary members. Consumers that use validators which ignore unknown `x-*` keywords need no extra setup for these built-in annotation-only fields.

```typescript
const builtInAnnotationKeywords = [
  "x-formspec-option-source",
  "x-formspec-option-source-params",
  "x-formspec-schema-source",
  "x-formspec-deprecation-description",
];
```

### 8.3 Extension Validation Keyword Pattern

Extension packages that introduce custom validation keywords are responsible for providing whatever validator/runtime support those keywords need. For example, a decimal extension might introduce `x-stripe-max-sig-fig` and pair it with custom runtime validation logic.

```typescript
const keyword = "x-stripe-max-sig-fig";
// Validator-specific integration lives in the extension package.
// FormSpec core only defines the schema-emission contract.
```

#### Significant figure counting is extension-provided

FormSpec core does not implement significant figure counting. The actual implementation is the extension consumer's responsibility. The consumer chooses the precision library appropriate to their domain (e.g., a bigint-based library for financial contexts, `decimal.js` for scientific contexts). FormSpec defines the emitted keyword shape; the validation logic is entirely within the extension package.

This is consistent with the overall extensibility model: FormSpec provides infrastructure (keyword registration, composition rules, diagnostic codes), and the extension provides domain-specific semantics (how to count significant figures, what precision library to use, what edge cases to handle).

### 8.4 Package Structure for Validator Integration

Per A7 (pay only for what you use) and NP2 (runtime validation is an independent concern), schema generation and runtime validation remain separate concerns:

```
@formspec/build              — schema generation (no validator dependency)
@formspec/runtime            — dynamic resolver helpers (defineResolvers)
@formspec/validator          — runtime validation backed by @cfworker/json-schema
extension packages           — optional validator/runtime support for extension-defined validation keywords
```

Consumers who want runtime validation:

```bash
pnpm add @formspec/validator
```

Consumers who only need schema generation:

```bash
pnpm add @formspec/build
```

### 8.5 Standalone Schema Artifact

The JSON Schema output is usable as a standalone artifact without any FormSpec-aware tooling (PP7). A consumer who receives a FormSpec-generated schema can:

1. Use it with `@formspec/validator` and get standard JSON Schema validation while built-in `x-*` annotation keywords are ignored safely
2. Use it with any other standards-compliant JSON Schema validator — standard keywords behave as expected; unrecognized custom keywords are validator-specific but are typically ignored
3. Layer in extension-specific runtime support only when extension-defined validation keywords need executable behavior

To minimize noise across validators, custom keyword names follow the `x-` convention, which signals "extension keyword" to JSON Schema tooling.

---

## 9. Full Example: Invoice Form Schema

This example shows the complete JSON Schema output for a form with multiple field types, constraints, and named types.

### TypeScript source (TSDoc surface):

```typescript
interface Address {
  /** @displayName Street */
  street: string;
  /** @displayName City */
  city: string;
  /**
   * @displayName Country Code
   * @minLength 2
   * @maxLength 2
   * @pattern ^[A-Z]{2}$
   */
  country: string;
}

interface InvoiceFormData {
  /** @displayName Invoice Form */
  /**
   * @displayName Customer Name
   * @minLength 1
   * @maxLength 100
   */
  customerName: string;

  /**
   * @displayName Invoice Status
   * @displayName :draft Draft
   * @displayName :sent Sent to Customer
   * @displayName :paid Paid in Full
   * @defaultValue draft
   */
  status: "draft" | "sent" | "paid";

  /**
   * @displayName Total Amount
   * @minimum :value 0.01
   * @maximum :value 9999999.99
   * @multipleOf :value 0.01
   */
  total: MonetaryAmount;

  /** @displayName Billing Address */
  billingAddress: Address;

  /**
   * @displayName Notes
   * @maxLength 500
   * @placeholder Add any internal notes here
   */
  notes?: string;
}
```

### Generated JSON Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "title": "Invoice Form",
  "properties": {
    "customerName": {
      "type": "string",
      "title": "Customer Name",
      "minLength": 1,
      "maxLength": 100
    },
    "status": {
      "enum": ["draft", "sent", "paid"],
      "x-formspec-display-names": {
        "draft": "Draft",
        "sent": "Sent to Customer",
        "paid": "Paid in Full"
      },
      "default": "draft"
    },
    "total": {
      "$ref": "#/$defs/MonetaryAmount",
      "properties": {
        "value": {
          "minimum": 0.01,
          "maximum": 9999999.99,
          "multipleOf": 0.01
        }
      },
      "title": "Total Amount"
    },
    "billingAddress": {
      "$ref": "#/$defs/Address",
      "title": "Billing Address"
    },
    "notes": {
      "type": "string",
      "title": "Notes",
      "maxLength": 500
    }
  },
  "required": ["customerName", "status", "total", "billingAddress"],
  "$defs": {
    "MonetaryAmount": {
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "currency": { "type": "string" }
      },
      "required": ["value", "currency"]
    },
    "Address": {
      "type": "object",
      "properties": {
        "street": { "type": "string", "title": "Street" },
        "city": { "type": "string", "title": "City" },
        "country": {
          "type": "string",
          "title": "Country Code",
          "minLength": 2,
          "maxLength": 2,
          "pattern": "^[A-Z]{2}$"
        }
      },
      "required": ["street", "city", "country"]
    }
  }
}
```

**Note on `$ref` + sibling keywords:** JSON Schema 2020-12 allows sibling keywords alongside `$ref` (unlike draft-07, where siblings were ignored). `billingAddress` pairs a bare `$ref` with a sibling `title`; `total` adds path-targeted subfield overrides as siblings (`properties`) plus a `title`. Both shapes are valid 2020-12 and are emitted directly by FormSpec — no `allOf` wrapping is introduced for these cases (see §5.4).

---

## Appendix A: Custom Keyword Summary

| Keyword (default prefix)             | Type     | Validation?                         | Applies to                                       |
| ------------------------------------ | -------- | ----------------------------------- | ------------------------------------------------ |
| `x-formspec-option-source`           | string   | Annotation only                     | `type: "string"`                                 |
| `x-formspec-option-source-params`    | string[] | Annotation only                     | `type: "string"` with `x-formspec-option-source` |
| `x-formspec-schema-source`           | string   | Annotation only                     | `type: "object"`                                 |
| `x-formspec-display-names`           | object   | Annotation only                     | Enum schemas with resolved member display names  |
| `x-formspec-deprecation-description` | string   | Annotation only                     | Schemas with `"deprecated": true`                |
| `x-formspec-remarks`                 | string   | Annotation only                     | Any schema with supplementary `@remarks` content |
| `x-<vendor>-max-sig-fig`             | integer  | Yes — validates (extension-defined) | Extension-defined types                          |

Extension-specific keywords follow the pattern `x-<vendor>-<extension-name>` and are annotation-only unless the extension also provides validator/runtime support per E2.

---

## Appendix B: Open Decisions Summary

| #    | Section | Question                                                               | Status                                                                                        |
| ---- | ------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| OD-1 | §3.1    | Should the vocabulary URI be fully configurable?                       | **DECIDED:** Yes — full URI override, default derived from vendor prefix                      |
| OD-2 | §5.2    | Should single-use named types be lifted to `$defs`?                    | **DECIDED:** Yes — all named types, regardless of use count, for high-fidelity output         |
| OD-3 | §5.4    | `allOf` inline vs derived `$defs` for subfield constraints?            | `allOf` inline at use site (default); derived `$defs` deferred                                |
| OD-4 | §7      | `anyOf` vs `oneOf` for non-discriminated unions?                       | **DECIDED:** Default to `anyOf`; use `oneOf` only for discriminated unions and literal unions |
| OD-5 | §7.3    | Should named union member types be lifted to `$defs`?                  | **DECIDED:** Yes — named member types lifted to `$defs` and referenced in `oneOf`             |
| OD-6 | §2.5    | Should `additionalProperties: false` be a project-level config option? | **DECIDED:** Yes — `schema.additionalProperties: "strict"                                     | "allow"` |
