# 003 — JSON Schema Vocabulary

This document specifies how FormSpec's canonical IR maps to JSON Schema 2020-12 keywords, what custom vocabulary keywords are required and how they are named, and how the Ajv validator integrates with the custom vocabulary. It covers strategic workstream C.

---

## 1. Overview

### Principles Satisfied

| Principle                                          | How this document satisfies it                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PP6** (JSON Schema as normative output)          | All generated output targets JSON Schema 2020-12. The meta-schema validates every generated document. Custom keywords are declared as a proper vocabulary                   |
| **PP7** (High-fidelity JSON Schema output)         | Named types are emitted as `$defs` with `$ref`. Custom keywords are registered as executable vocabulary keywords in Ajv, not opaque metadata. The output works standalone   |
| **E3** (Custom vocabulary keywords are namespaced) | All custom keywords use a configurable `x-<vendor>-` prefix (default `x-formspec-`). The vocabulary URI also includes the vendor prefix                                     |
| **PP10** (White-labelable)                         | The vendor prefix, vocabulary URI, and `$schema` annotation are all configurable. No hard-coded "formspec" strings appear in generated output when the vendor is overridden |
| **PP9** (Configurable surface area)                | Custom keywords that represent features disabled by project configuration are not emitted                                                                                   |
| **B3** (Lossy transformations are configurable)    | Extension-defined precision keywords (e.g., `maxSigFig`) must support configurable precision-loss policies; the default should reject, not silently round                   |
| **B4** (JSON Schema is the contract boundary)      | The IR is the source of truth; the JSON Schema is derived from it. If they disagree, fix the generator                                                                      |
| **S1** (Specialization narrows)                    | `allOf` composition preserves and narrows constraints when types specialize                                                                                                 |
| **PP2** (Inference over declaration)               | Standard JSON Schema keywords are inferred from TypeScript types without requiring author annotation where possible                                                         |

### Relationship to 001 (Canonical IR)

JSON Schema generation is a pure function of the canonical IR (A3). This document specifies the mapping from each IR node kind to JSON Schema keywords. The generator never consults the TypeScript AST or surface syntax directly — only the IR.

### JSON Schema Draft

FormSpec targets **JSON Schema 2020-12** (`https://json-schema.org/draft/2020-12/schema`). The `$schema` keyword in every generated root schema is set to the 2020-12 URI.

**Note on current implementation:** The existing `@formspec/build` generator currently targets draft-07. Migration to 2020-12 is required as part of implementing this design. The key behavioral differences are: `exclusiveMinimum`/`exclusiveMaximum` are numeric in 2020-12 (they were boolean flags in draft-04/draft-06 and numeric in draft-07; the 2020-12 behavior matches draft-07, so no change needed here). The `contains` keyword and `$defs` (replacing `definitions`) are standard in 2020-12.

---

## 2. Mapping from Canonical IR to Stock JSON Schema Keywords

### 2.1 Primitive Types

| IR type                                           | JSON Schema output                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `string`                                          | `{ "type": "string" }`                                                                                                                                              |
| `number`                                          | `{ "type": "number" }`                                                                                                                                              |
| `number` with `MultipleOfConstraint { value: 1 }` | `{ "type": "integer" }` (generator promotes `"number"` → `"integer"` when `multipleOf: 1` is present; the `multipleOf` keyword is omitted from output as redundant) |
| `boolean`                                         | `{ "type": "boolean" }`                                                                                                                                             |
| `null`                                            | `{ "type": "null" }`                                                                                                                                                |
| `undefined`                                       | Not emitted (optionality is expressed via `required`, per S8)                                                                                                       |
| `unknown` / `any`                                 | `{}` (accepts any value)                                                                                                                                            |
| `never`                                           | `{ "not": {} }`                                                                                                                                                     |

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

**Note on `enum` vs `oneOf[const]`:** When enum members carry per-member metadata (via `@displayName`, `@description`, or `@enumOptions`), the generator uses `oneOf` with per-member `const`/`title`/`description` instead of the flat `enum` keyword. This preserves the member metadata in a way that is standard-compliant and usable by form renderers:

```json
{
  "oneOf": [
    { "const": "draft", "title": "Draft Invoice" },
    { "const": "sent", "title": "Sent to Customer" },
    { "const": "paid", "title": "Paid in Full" }
  ]
}
```

When no per-member metadata exists, the flat `enum` form is preferred (simpler, equally valid).

### 2.4 Array Types

| IR node                  | JSON Schema output                                                    |
| ------------------------ | --------------------------------------------------------------------- |
| `T[]`                    | `{ "type": "array", "items": <T schema> }`                            |
| Tuple `[A, B, C]`        | `{ "type": "array", "prefixItems": [<A>, <B>, <C>], "items": false }` |
| `minItems` constraint    | `"minItems": n` added to array schema                                 |
| `maxItems` constraint    | `"maxItems": n` added to array schema                                 |
| `uniqueItems` constraint | `"uniqueItems": true` added to array schema                           |

### 2.5 Object Types

| IR node                              | JSON Schema output                                             |
| ------------------------------------ | -------------------------------------------------------------- |
| Object with known properties         | `{ "type": "object", "properties": {...}, "required": [...] }` |
| Required property                    | Listed in `"required"` array                                   |
| Optional property                    | Absent from `"required"` array                                 |
| Index signature `{ [k: string]: T }` | `{ "type": "object", "additionalProperties": <T schema> }`     |
| Mixed (known + index signature)      | `"properties"` + `"additionalProperties"` combined             |

**`additionalProperties` policy:** When a TypeScript type has only known properties and no index signature, `additionalProperties` is **not** set to `false` by default. Setting it to `false` would cause validation failures when form renderers add extra fields (e.g., `_id`, `_timestamp`). This is intentional and matches B4 (the JSON Schema represents the data contract, not the full TypeScript structural check).

**DECIDED:** The `additionalProperties` policy is configurable. Projects can set `schema.additionalProperties: "strict" | "allow"` in their FormSpec configuration. `"allow"` (the default) omits `additionalProperties`; `"strict"` sets it to `false` on all generated object schemas. This is a PP9-style constraint setting.

### 2.6 Numeric Constraints

| IR constraint                                           | JSON Schema keyword                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NumericBoundConstraint { bound: "minimum" }`           | `"minimum"`                                                                                                                                                 |
| `NumericBoundConstraint { bound: "maximum" }`           | `"maximum"`                                                                                                                                                 |
| `NumericBoundConstraint { bound: "exclusive-minimum" }` | `"exclusiveMinimum"`                                                                                                                                        |
| `NumericBoundConstraint { bound: "exclusive-maximum" }` | `"exclusiveMaximum"`                                                                                                                                        |
| `MultipleOfConstraint`                                  | `"multipleOf"` (when `value` is `1`, the generator also promotes `"type": "number"` to `"type": "integer"` and omits the `"multipleOf"` keyword — see §2.1) |

### 2.7 String Constraints

| IR constraint                                   | JSON Schema keyword |
| ----------------------------------------------- | ------------------- |
| `StringLengthConstraint { bound: "minLength" }` | `"minLength"`       |
| `StringLengthConstraint { bound: "maxLength" }` | `"maxLength"`       |
| `PatternConstraint`                             | `"pattern"`         |
| `FormatAnnotation`                              | `"format"`          |

### 2.8 Annotation → Metadata Keywords

| IR annotation            | JSON Schema keyword                                |
| ------------------------ | -------------------------------------------------- |
| `DisplayNameAnnotation`  | `"title"`                                          |
| `DescriptionAnnotation`  | `"description"`                                    |
| `DefaultValueAnnotation` | `"default"`                                        |
| `ExampleAnnotation[]`    | `"examples"` (array)                               |
| `DeprecatedAnnotation`   | `"deprecated": true` (2020-12 standard annotation) |
| `ReadOnlyAnnotation`     | `"readOnly"`                                       |
| `WriteOnlyAnnotation`    | `"writeOnly"`                                      |
| `ConstConstraint`        | `"const"`                                          |

---

## 3. Custom Vocabulary Keywords

### 3.1 Vendor Prefix Configuration

All FormSpec custom keywords use a configurable vendor prefix. The default is `x-formspec-`. Organizations override this via project configuration:

```yaml
# .formspec.yml
schema:
  vendorPrefix: 'x-stripe-' # Override default "x-formspec-"
```

Throughout this document, the placeholder `<vendor>` represents the configured prefix (e.g., `x-formspec-` or `x-stripe-`).

The vocabulary URI also includes the vendor prefix:

- Default: `https://formspec.dev/vocab/x-formspec`
- With override: `https://formspec.dev/vocab/x-stripe`

**DECIDED:** The vocabulary URI is fully configurable. Organizations can override the entire URI in configuration (not just the prefix portion), enabling internal registries and documentation URLs. The default is derived from the vendor prefix (e.g., `https://formspec.dev/vocab/x-formspec`).

### 3.2 Dynamic Data Source Keywords

These keywords support the `field.dynamicEnum()` and `field.dynamicSchema()` Chain DSL features, where options or schemas are loaded at runtime.

#### `<vendor>source`

**Type:** string
**Applies to:** `{ "type": "string" }` schemas
**Semantics:** The value is a data source key registered in the runtime resolver registry. At runtime, a form renderer uses this key to fetch the available enum options.
**Validation behavior in Ajv:** The Ajv keyword annotation-only — it does not constrain the value at validation time (the value is a string, validated by the `type` keyword). The keyword carries its value as an annotation for runtime use.

Example:

```json
{
  "type": "string",
  "x-formspec-source": "countries"
}
```

#### `<vendor>params`

**Type:** `string[]`
**Applies to:** Schemas that also carry `<vendor>source`
**Semantics:** An ordered list of field names whose current values are passed as parameters to the data source resolver at runtime.
**Validation behavior in Ajv:** Annotation-only.

Example:

```json
{
  "type": "string",
  "x-formspec-source": "cities",
  "x-formspec-params": ["country"]
}
```

#### `<vendor>schemaSource`

**Type:** string
**Applies to:** `{ "type": "object" }` schemas
**Semantics:** The key for a runtime schema provider that returns the full JSON Schema for this field's value.
**Validation behavior in Ajv:** Annotation-only. The `additionalProperties: true` on the containing schema permits any object shape (since the actual schema is runtime-determined).

### 3.3 Extension-Defined Vocabulary Keywords (e.g., Decimal Precision)

FormSpec does not ship built-in decimal or precision vocabulary keywords. Instead, the `@maxSigFig` tag and its corresponding JSON Schema keyword are designed to be introduced by downstream consumers via the extension API (E1, E5). This is an intentional extensibility pressure test — a consumer defining a decimal type must be able to:

1. Register a custom vocabulary keyword (e.g., `<vendor>maxSigFig`) with its JSON Schema type, applicable types, and validation semantics
2. Broaden the `@maxSigFig` TSDoc tag to apply to their custom decimal type (see 002 §2.1)
3. Provide an Ajv keyword definition that executes validation at runtime (see §8)
4. Have the generator emit the keyword in the JSON Schema output when the tag is present

This pattern applies to any domain-specific vocabulary keyword — decimal precision is just the motivating example. The extension registration interface (see 001 §9) provides the hooks for all four steps.

**Note:** `<vendor>maxSigFig` (when registered) is a validation keyword, not an annotation keyword. It affects whether a value is accepted by Ajv. This distinguishes it from `<vendor>source` and `<vendor>params`, which are annotation-only.

### 3.4 Extension Keywords

Custom decorators (and in the TSDoc surface, custom extension tags — a future capability) emit extension keywords. The naming convention is:

```
<vendor><extension-name>
```

For example, a `sensitive` extension emits `x-formspec-sensitive` (or `x-stripe-sensitive` with a configured prefix).

Extension keywords are always annotation-only unless the extension registers an Ajv validator. Per E2, extensions must declare whether their keywords are validation keywords or annotation keywords at registration time.

---

## 4. Validation Keywords vs Annotation Keywords

JSON Schema 2020-12 distinguishes between keywords that affect validation and keywords that carry annotations. FormSpec aligns with this distinction.

### 4.1 Validation Keywords

These keywords determine whether a value is valid. An Ajv keyword registered as a validation keyword returns `true` or `false` from its validate function, and `false` causes validation to fail.

FormSpec core ships no custom validation keywords. Extension packages may register validation keywords (e.g., `<vendor>maxSigFig` for decimal precision) via the extension API (see §3.3 and §8.3).

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

- `<vendor>source`
- `<vendor>params`
- `<vendor>schemaSource`
- Extension-specific keywords (unless the extension registers a validator)

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

**Option A: Inline refinement at the use site** — emit the `$ref` wrapped in an `allOf` that adds the constraints:

```json
{
  "allOf": [
    { "$ref": "#/$defs/MonetaryAmount" },
    {
      "properties": {
        "value": { "minimum": 0 }
      }
    }
  ]
}
```

**Option B: Derived `$defs` entry** — create a new named `$defs` entry (e.g., `MonetaryAmount_constrained_discount`) that `allOf`s the base type with the refinements.

**Decision: Option A (inline `allOf` at the use site) is the default.** Option B is reserved for future work when multiple fields share the same constraint profile and deduplication is beneficial. Option A is simpler, more readable, and correctly represents that the constraints are field-specific, not type-specific.

The `allOf` + `$ref` pattern is standard 2020-12 and is the idiomatic way to express "this type, but with additional constraints." Ajv and other validators handle it correctly.

### 5.5 Circular Reference Handling

Circular types (e.g., `type TreeNode = { value: number; children?: TreeNode[] }`) are represented using `$defs` and `$ref`, which naturally handles cycles:

```json
{
  "$defs": {
    "TreeNode": {
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "children": {
          "type": "array",
          "items": { "$ref": "#/$defs/TreeNode" }
        }
      },
      "required": ["value"]
    }
  }
}
```

The generator must maintain a `visited` set of type names to detect cycles and emit `$ref` back to the in-progress `$defs` entry rather than recursing infinitely.

---

## 6. Decimal and Precision — Extensibility Acceptance Criteria

FormSpec does not ship built-in decimal types or precision vocabulary keywords. Decimal is a downstream concern (see 002 §2.1). This section defines the **specific outcomes** that the extension API must make possible, using decimal as the motivating example. These serve as acceptance criteria for the extensibility story (E1, E4, E5).

### 6.1 Required Outcomes

A downstream consumer introducing a `Decimal` type must be able to achieve all of the following without forking FormSpec core:

**Outcome 1: Define a custom type that participates in the type system.**
The consumer defines `type Decimal = string` (or a branded string type). FormSpec's analyzer recognizes it as a registered extension type. Fields of type `Decimal` are extracted and included in the IR and generated JSON Schema.

**Outcome 2: Broaden existing built-in constraint tags to apply to the custom type.**
Built-in tags like `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, and `@multipleOf` — which FormSpec ships for `number` and `bigint` — must also become applicable to `Decimal` fields. The extension declares this broadening; FormSpec's analyzer and ESLint rules respect it. Applying `@minimum 0` to a `Decimal` field is valid, not a type-compatibility error.

**Outcome 3: Introduce a new custom constraint tag.**
The consumer introduces `@maxSigFig` as a new constraint tag. It is set-influencing (narrows the valid value set) and composes via intersection (C1) — if a base type declares `@maxSigFig 8` and a derived type declares `@maxSigFig 4`, the result is `@maxSigFig 4`. An attempt to broaden (`@maxSigFig 12` on a type inheriting `@maxSigFig 8`) is a contradiction error (S1, S2).

**Outcome 4: Write ESLint rules with minimal boilerplate.**
The consumer writes ESLint rules for `Decimal` and `@maxSigFig` by expressing only the extension-specific logic — which types the tag applies to, what values are valid, what contradictions look like. FormSpec provides foundational rule infrastructure: tag-on-type validation, contradiction detection for set-influencing constraints, path-target resolution, provenance tracking. The consumer should not have to reimplement any of this.

**Outcome 5: Custom vocabulary keyword in JSON Schema output.**
The generator emits `<vendor>maxSigFig` as a custom vocabulary keyword in the JSON Schema output. The keyword is namespaced per E3 and registered as a validation keyword (not opaque metadata) per PP7.

```json
{
  "type": "string",
  "x-stripe-maxSigFig": 8,
  "x-stripe-minimum": "0"
}
```

**Outcome 6: Ajv validator for runtime validation.**
The consumer provides an Ajv keyword definition for `<vendor>maxSigFig` that executes at runtime. FormSpec's Ajv integration package provides the registration hook (see §8.3). The validator is isolated in the consumer's package — it does not pollute FormSpec core's dependency graph (A8).

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
    precisionLoss: 'error' # default: fail on any precision loss
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

### 7.2 `allOf` for Progressive Refinement

When a TypeScript type extends another (or when subfield constraints are applied), the generator uses `allOf` to compose the base type with refinements:

```typescript
interface BaseAmount {
  value: number;
  currency: string;
}

interface PositiveAmount extends BaseAmount {
  // Constraints applied at the use site via @minimum :value 0
}
```

```json
{
  "allOf": [
    { "$ref": "#/$defs/BaseAmount" },
    {
      "properties": {
        "value": { "minimum": 0 }
      }
    }
  ]
}
```

### 7.3 `oneOf` for Discriminated Unions

Discriminated unions are emitted as `oneOf` with a `required` discriminant in each branch:

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rectangle'; width: number; height: number };
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

## 8. Ajv Integration Strategy

### 8.1 Custom Vocabulary Registration

FormSpec's custom vocabulary is registered with Ajv as a vocabulary object. This enables custom keywords to function as proper executable validators, not just annotations that Ajv silently ignores (satisfying PP7).

The vocabulary is distributed as part of the FormSpec runtime package (`@formspec/runtime` or a dedicated `@formspec/ajv-vocab` package — see §8.4). Consumers who only need schema generation (not runtime validation) do not pay for Ajv (per A7).

```typescript
// Conceptual API — see @formspec/runtime for implementation
import Ajv from 'ajv';
import { formspecVocabulary } from '@formspec/ajv-vocab';

const ajv = new Ajv();
ajv.addVocabulary(formspecVocabulary);

const validate = ajv.compile(myFormSchema);
const valid = validate(userData);
```

### 8.2 Vocabulary Definition

The vocabulary object passed to `ajv.addVocabulary` contains keyword definitions for each custom validation keyword. Annotation keywords are also registered so Ajv does not emit "unknown keyword" warnings.

```typescript
// Vocabulary definition sketch — FormSpec core keywords (annotation-only)
// Extension-defined validation keywords (e.g., maxSigFig) are registered
// by the extension package, not by FormSpec core.
const formspecVocabulary: Vocabulary = [
  // Annotation keywords (no validation effect)
  {
    keyword: 'x-formspec-source',
    schemaType: 'string',
  },
  {
    keyword: 'x-formspec-params',
    schemaType: 'array',
  },
  {
    keyword: 'x-formspec-schemaSource',
    schemaType: 'string',
  },
];
```

### 8.3 Extension Validator Pattern

Extension packages register their own validation keywords. For example, a decimal extension would register `maxSigFig`:

```typescript
// In the extension package, NOT in FormSpec core
const decimalVocabulary: Vocabulary = [
  {
    keyword: 'x-stripe-maxSigFig', // vendor prefix from config
    type: 'number',
    schemaType: 'number',
    validate: validateMaxSigFig,
    errors: true,
  },
];

function validateMaxSigFig(schema: number, data: number): boolean {
  const sigFigs = countSignificantFigures(data);
  return sigFigs <= schema;
}
```

#### Significant figure counting is extension-provided

FormSpec core does not implement significant figure counting. The `validateMaxSigFig` function shown above is illustrative — the actual implementation is the extension consumer's responsibility. The consumer chooses the precision library appropriate to their domain (e.g., a bigint-based library for financial contexts, `decimal.js` for scientific contexts). FormSpec provides the Ajv keyword registration hook; the validation logic is entirely within the extension package.

This is consistent with the overall extensibility model: FormSpec provides infrastructure (keyword registration, composition rules, diagnostic codes), and the extension provides domain-specific semantics (how to count significant figures, what precision library to use, what edge cases to handle).

### 8.4 Package Structure for Ajv Integration

Per A7 (pay only for what you use) and NP2 (runtime validation is an independent concern), the Ajv vocabulary is isolated in a package that does not transitively depend on Ajv in the schema-generation path:

```
@formspec/ajv-vocab          — vocabulary definition + keyword validators
  peerDependency: ajv ^8
  depends on: nothing (standalone)

@formspec/runtime            — dynamic resolver helpers (defineResolvers)
  optionally re-exports @formspec/ajv-vocab utilities

@formspec/build              — schema generation (no Ajv dependency)
```

Consumers who want runtime validation:

```bash
pnpm add @formspec/ajv-vocab ajv
```

Consumers who only need schema generation:

```bash
pnpm add @formspec/build
```

### 8.5 Standalone Schema Artifact

The JSON Schema output is usable as a standalone artifact without any FormSpec-aware tooling (PP7). A consumer who receives a FormSpec-generated schema can:

1. Use it with standard Ajv (standard keywords validate correctly; custom keywords are unknown and silently ignored, or produce "unknown keyword" warnings depending on Ajv's `strict` mode)
2. Register the FormSpec vocabulary to get full custom keyword validation
3. Use it with any other JSON Schema validator — standard keywords behave as expected; custom keywords are ignored per the JSON Schema specification's handling of unrecognized keywords

To minimize noise with standard Ajv (without vocabulary registration), custom keyword names follow the `x-` convention, which signals "extension keyword" to JSON Schema tooling and causes some validators to skip them without warnings.

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
  status: 'draft' | 'sent' | 'paid';

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
      "oneOf": [
        { "const": "draft", "title": "Draft" },
        { "const": "sent", "title": "Sent to Customer" },
        { "const": "paid", "title": "Paid in Full" }
      ],
      "default": "draft"
    },
    "total": {
      "allOf": [
        { "$ref": "#/$defs/MonetaryAmount" },
        {
          "properties": {
            "value": {
              "minimum": 0.01,
              "maximum": 9999999.99,
              "multipleOf": 0.01
            }
          }
        }
      ],
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

**Note on `$ref` + sibling keywords:** JSON Schema 2020-12 allows sibling keywords alongside `$ref` (unlike draft-07, where siblings were ignored). The `"title"` alongside `"$ref"` in `billingAddress` and the `allOf` + `"title"` in `total` are valid 2020-12. This is a deliberate 2020-12 feature used by FormSpec for clean output.

---

## Appendix A: Custom Keyword Summary

| Keyword (default prefix)  | Type     | Validation?                         | Applies to                     |
| ------------------------- | -------- | ----------------------------------- | ------------------------------ |
| `x-formspec-source`       | string   | Annotation only                     | `type: "string"`               |
| `x-formspec-params`       | string[] | Annotation only                     | `type: "string"` with `source` |
| `x-formspec-schemaSource` | string   | Annotation only                     | `type: "object"`               |
| `x-<vendor>-maxSigFig`    | integer  | Yes — validates (extension-defined) | Extension-defined types        |

Extension-specific keywords follow the pattern `x-<vendor>-<extension-name>` and are annotation-only unless the extension registers an Ajv validator per E2.

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
