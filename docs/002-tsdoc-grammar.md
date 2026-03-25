# 002 — TSDoc Tag Grammar & Extraction

This document specifies the complete grammar for TSDoc tags that FormSpec recognizes, how each tag is extracted from the TypeScript AST, and how extracted data maps to canonical IR nodes. It covers strategic workstream D.

---

## 1. Overview

### Principles Satisfied

| Principle                                         | How this document satisfies it                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PP1** (TypeScript-native authoring)             | Tags are valid TSDoc — they pass `tsc` and are rendered by documentation generators without special tooling                                                                                                                       |
| **PP2** (Inference over declaration)              | Tags are only required when the type system cannot infer the information. `@minimum` on a `number` field adds information TypeScript cannot represent; `@deprecated` on a field already deprecated via `@deprecated` is redundant |
| **S4** (Type determines applicable constraints)   | The extractor validates that each tag is applied to a compatible type; applying `@minLength` to a `number` field is a static error (D-class diagnostic)                                                                           |
| **S5** (Few tags, composable grammar)             | Path-target syntax (`:fieldName`) and member-target syntax work across all tags. No new tag is invented when grammar can extend an existing one                                                                                   |
| **S6** (Reuse ecosystem tags)                     | `@defaultValue`, `@deprecated`, `@example`, `@remarks`, `@see` are standard TSDoc tags reused without modification. FormSpec-specific tags are reserved for concepts with no ecosystem equivalent                                 |
| **S7** (Embrace TypeScript's full expressiveness) | All four enum patterns (`const enum`, `enum`, string-literal union, `as const` array) are recognized. Tags apply wherever the semantics make sense                                                                                |
| **PP9** (Configurable surface area)               | Every FormSpec-specific tag can be disabled via `.formspec.yml`. Disabled tags are treated as unknown and produce D4-class warnings if present                                                                                    |
| **PP10** (White-labelable)                        | Diagnostic code prefixes are configurable; no hard-coded "formspec" text in error messages                                                                                                                                        |
| **D1–D6** (Diagnostic properties)                 | Each parse error taxonomy entry maps to a structured, source-located, actionable diagnostic                                                                                                                                       |

### Relationship to 001 (Canonical IR)

TSDoc extraction is the first phase of the pipeline for the type-annotation authoring surface. The extractor produces IR nodes — constraint nodes and annotation nodes — that feed into the canonical IR alongside equivalent nodes produced by the chain DSL. See document 001 for IR type definitions. This document uses IR type names as defined there (e.g., `ConstraintNode`, `AnnotationNode`, `FieldIRNode`).

---

## 2. Tag Name Inventory

Tags are organized into four categories: **constraint tags** (set-influencing, per C1), **annotation tags** (value-influencing, per C1), **structure tags** (control presentation without affecting data schema), and **ecosystem tags** (standard TSDoc reused without modification).

### 2.1 Constraint Tags

Constraint tags narrow the set of valid values for a field. Per S1, constraints can only narrow — an attempt to broaden a constraint inherited from a base type is a static error. Per S4, each tag is only valid on fields whose type is compatible with the constraint. Per C1, multiple constraint tags on the same field compose by intersection.

| Tag                 | Applicable types                                        | IR node kind                 | Maps to JSON Schema keyword      |
| ------------------- | ------------------------------------------------------- | ---------------------------- | -------------------------------- |
| `@minimum`          | `number`, `bigint` (extensible to custom numeric types) | `NumericBoundConstraint`     | `minimum`                        |
| `@maximum`          | `number`, `bigint` (extensible to custom numeric types) | `NumericBoundConstraint`     | `maximum`                        |
| `@exclusiveMinimum` | `number`, `bigint` (extensible to custom numeric types) | `NumericBoundConstraint`     | `exclusiveMinimum`               |
| `@exclusiveMaximum` | `number`, `bigint` (extensible to custom numeric types) | `NumericBoundConstraint`     | `exclusiveMaximum`               |
| `@multipleOf`       | `number`, `bigint` (extensible to custom numeric types) | `MultipleOfConstraint`       | `multipleOf`                     |
| `@minLength`        | `string`                                                | `StringLengthConstraint`     | `minLength`                      |
| `@maxLength`        | `string`                                                | `StringLengthConstraint`     | `maxLength`                      |
| `@pattern`          | `string`                                                | `PatternConstraint`          | `pattern`                        |
| `@minItems`         | `T[]`                                                   | `ArrayLengthConstraint`      | `minItems`                       |
| `@maxItems`         | `T[]`                                                   | `ArrayLengthConstraint`      | `maxItems`                       |
| `@uniqueItems`      | `T[]`                                                   | `UniquenessConstraint`       | `uniqueItems`                    |
| `@maxSigFig`        | `number` (extensible to custom types)                   | `DecimalPrecisionConstraint` | `x-<vendor>-maxSigFig` (see 003) |
| `@const`            | any                                                     | `ConstConstraint`            | `const`                          |

**Note on integer representation:** There is no `@integer` tag. Integer semantics are expressed via `@multipleOf 1` on a `number` field. The JSON Schema generator detects `multipleOf: 1` on a number type and promotes the output to `"type": "integer"` (see 003 §2.1). This is consistent with PP3 — `@multipleOf` is the constraint; integer is an output optimization.

**Note on date range constraints (`@before`, `@after`):** These tags are not built into FormSpec core. They are introduced by a date extension via the extension API (E1, E5), following the same pattern as `@maxSigFig` for Decimal. A downstream consumer registers the tags, provides the IR node kind, the JSON Schema vocabulary keyword, and the Ajv validator. The FormSpec test suite uses a date extension as a fixture to validate this extensibility path.

**Note on `decimal`:** FormSpec does not ship a built-in `decimal` type. Decimal is a downstream concern — consumers define their own string-backed decimal type (e.g., `type Decimal = string`) with custom serialization logic. This is an intentional extensibility pressure test (E1, E5): a consumer adding decimal support must be able to (1) define a new type, (2) broaden `@maxSigFig` to apply to it, (3) register ESLint rules that understand the tag is valid on this type, and (4) provide custom serialization from the decimal representation to a JSON Schema string. All of these should be achievable through FormSpec's extension API without forking the core. The `@maxSigFig` tag is built-in (it has clear JSON Schema vocabulary semantics), but the set of types it applies to is extensible.

### 2.2 Annotation Tags

Annotation tags carry a single scalar value. Per C1, they compose via override — the most-specific declaration wins. Annotations do not affect the valid value set.

| Tag            | IR node kind            | Emitted in                               | Notes                                                                                               |
| -------------- | ----------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@displayName` | `DisplayNameAnnotation` | JSON Schema `title`, UI Schema label     | Per-field, per-member (`:member` syntax), and per-variant (`:plural`, `:singular`)                  |
| `@apiName`     | `ApiNameAnnotation`     | JSON Schema property names, `$defs` keys | Controls JSON representation names. Per-variant (`:plural`, `:singular`) on classes; bare on fields |
| `@description` | `DescriptionAnnotation` | JSON Schema `description`                | Longer prose; fallback to TSDoc `@remarks` if absent                                                |
| `@placeholder` | `PlaceholderAnnotation` | UI Schema only (`options.placeholder`)   | Not a JSON Schema concept                                                                           |
| `@format`      | `FormatAnnotation`      | JSON Schema `format`                     | Standard JSON Schema formats (`date`, `email`, `uri`, etc.) plus renderer hints                     |
| `@order`       | `FieldOrderAnnotation`  | UI Schema element order                  | Integer; lower values appear first                                                                  |

### 2.3 Ecosystem Tags (Reused Without Modification)

These are standard TSDoc or JSDoc tags with well-defined semantics. FormSpec extracts and records them but does not invent FormSpec-specific equivalents (per S6).

| Tag             | Source standard | IR treatment                                                      | Output                                                |
| --------------- | --------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `@defaultValue` | TSDoc           | `DefaultValueAnnotation`                                          | JSON Schema `default`                                 |
| `@deprecated`   | TSDoc / JSDoc   | `DeprecatedAnnotation`                                            | JSON Schema `deprecated: true`, diagnostic hint in UI |
| `@example`      | TSDoc           | `ExampleAnnotation`                                               | JSON Schema `examples` array                          |
| `@remarks`      | TSDoc           | Treated as `@description` when no explicit `@description` present | JSON Schema `description`                             |
| `@see`          | TSDoc / JSDoc   | Recorded in provenance, not emitted to schemas                    | Tooling use only                                      |
| `@param`        | TSDoc           | Not extracted for form fields (applies to methods)                | N/A                                                   |
| `@returns`      | TSDoc           | Not extracted for form fields                                     | N/A                                                   |

**Interaction with `@remarks` and `@description`:** If both `@description` and `@remarks` are present on the same field, `@description` wins (override rule per C1). `@remarks` is only used as a fallback. A warning (D4-class) is emitted if both are present, suggesting the author remove one.

### 2.4 Structure Tags

Structure tags control UI presentation without affecting the data schema (per C2).

| Tag            | IR node kind            | Notes                                                                                                    |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `@group`       | `GroupAnnotation`       | Assign this field to a named visual group. String argument is the group name                             |
| `@showWhen`    | `ConditionalAnnotation` | Conditional visibility rule — SHOW effect (see §3.4 for argument grammar)                                |
| `@hideWhen`    | `ConditionalAnnotation` | Conditional visibility rule — HIDE effect; mutually exclusive with `@showWhen` on the same field         |
| `@enableWhen`  | `ConditionalAnnotation` | Conditional interactivity rule — ENABLE effect (see §3.4 for argument grammar)                           |
| `@disableWhen` | `ConditionalAnnotation` | Conditional interactivity rule — DISABLE effect; mutually exclusive with `@enableWhen` on the same field |

**Note on JSON Forms layout types:** JSON Forms supports several layout types (`VerticalLayout`, `HorizontalLayout`, `Categorization`, `Category`). These are deliberately **not** represented as TSDoc tags. Layout type selection is a generation-time configuration concern — for example, a consumer can configure FormSpec to wrap all top-level elements in a `VerticalLayout` at build time. This keeps the authoring surface focused on data semantics and constraints, and moves presentational framing to the build configuration where each consumer can make their own choices (per C2, PP9). Layout tags may be added in a future version if authoring-time layout control proves necessary.

---

## 3. Argument Grammar Per Tag

### 3.1 Grammar Notation

The grammar below uses a simplified EBNF-like notation:

```
tag         ::= "@" tagname [ " " modifier ] [ " " value ]
modifier    ::= path-target | member-target
path-target ::= ":" identifier
member-target ::= ":" ( identifier | string-literal )
value       ::= number-literal | string-literal | boolean-literal | regex-literal | json-value
```

Whitespace between tokens is significant only as a separator; leading and trailing whitespace in the tag's comment text is trimmed before parsing.

### 3.2 Per-Tag Value Grammar

#### Numeric constraint tags

`@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`

```
value ::= number-literal
number-literal ::= [ "-" ] ( integer-part [ "." fraction-part ] [ exponent ] )
integer-part   ::= [0-9]+
fraction-part  ::= [0-9]+
exponent       ::= ( "e" | "E" ) [ "+" | "-" ] [0-9]+
```

The grammar supports values of arbitrary magnitude and precision — the same literal syntax works whether the target field is `number` or `bigint`. The parser preserves the literal text for `bigint` fields to avoid precision loss (B3); for `number` fields it parses with JavaScript's `Number()`. Values that produce `NaN` or `Infinity` are parse errors (ERR-002). Custom numeric types registered via extensions (e.g., a string-backed decimal) can also opt into these constraint tags — the extension declares which tags are applicable and how literal values are parsed.

Examples:

```typescript
/** @minimum 0 */
/** @maximum 1_000_000 */ // underscore separators NOT supported — parse error
/** @minimum -3.14 */
/** @exclusiveMinimum 0 */
/** @multipleOf 0.01 */

// bigint fields — value can exceed Number.MAX_SAFE_INTEGER
/** @minimum 0 */
/** @maximum 9999999999999999999 */
count: bigint;

// custom numeric types (e.g., string-backed decimal via extension)
// extensions declare which constraint tags apply and how values are parsed
/** @minimum 0.01 */
/** @maximum 999999.99 */
amount: Decimal; // consumer-defined type, not built-in
```

**With path-target syntax** (see §4 for full path-target specification):

Numeric constraints can target a subfield of a complex type using the `:property` modifier. The constraint is validated against the subfield's type, not the parent field's type (S4).

```typescript
interface MonetaryAmount {
  value: number;
  currency: string;
}

interface CartDiscount {
  /** @maxLength 50 */
  reason: string;

  /**
   * @minimum :value 0
   */
  amount: MonetaryAmount; // only allows positive monetary amounts
}
```

This also works with string constraints on subfields:

```typescript
interface Invoice {
  /**
   * @minimum :value 0.01
   * @maximum :value 9999999.99
   * @pattern :currency ^[A-Z]{3}$
   */
  total: MonetaryAmount;
}
```

#### String length constraint tags

`@minLength`, `@maxLength`

```
value ::= non-negative-integer
non-negative-integer ::= "0" | [1-9][0-9]*
```

Non-integer or negative values are parse errors (ERR-003).

#### `@minItems`, `@maxItems`

Same grammar as string length — non-negative integer only.

#### `@uniqueItems`

Bare marker tag. No argument. If an argument is provided, it is silently ignored with an info diagnostic.

```typescript
/** @uniqueItems */
tags: string[];
```

#### `@pattern`

```
value ::= regex-string
```

The value is the entire remaining comment text after trimming. It is treated as an ECMAScript regex pattern string. The extractor validates that it compiles without error (via `new RegExp(value)`); invalid patterns are parse errors (ERR-004).

#### `@maxSigFig`

Same grammar as `@minLength`/`@maxLength` — positive integer only. Zero is a parse error (ERR-003) because zero significant figures is meaningless.

**Note:** There is no `@minSigFig` tag. Minimum precision requirements are better expressed via `@minimum`/`@maximum` value bounds or `@pattern` constraints on the string representation. `@maxSigFig` constrains the maximum precision a value may carry, which is the meaningful direction for precision control (e.g., "at most 2 significant figures for currency").

#### `@const`

```
value ::= json-value
json-value ::= string-literal | number-literal | boolean-literal | "null" | json-object | json-array
```

The entire remaining comment text is parsed as JSON. Parse failures are ERR-005.

**Note on enum member display names:** There is no `@enumOptions` tag. Enum member display names use `@displayName` with member-target syntax — the same tag and grammar used everywhere else (S5). This avoids introducing a bespoke tag with its own `key=value` or JSON syntax. See the `@displayName` grammar below and examples in §9.4–9.6.

#### `@displayName`

```
value ::= text-until-end-of-line
```

The entire remaining comment text after the modifier (if any) is the display name. HTML tags are not stripped; the value is stored as-is. Maximum length is configurable (per PP9) — consumers set a project-level limit and values exceeding it produce a lint error.

```typescript
/** @displayName Payment Amount */
amount: MonetaryAmount;
```

With member-target syntax (for union/enum members):

```typescript
/**
 * @displayName :sync Synchronous
 * @displayName :async Asynchronous
 */
mode: 'sync' | 'async';
```

**Variant qualifiers** — `:singular` and `:plural` — provide context-specific display names. These are only valid on classes/interfaces and array fields, where the distinction between "one of these" and "many of these" is meaningful:

```typescript
/**
 * A car rental
 * @displayName :plural Rentals
 * @displayName :singular Car Rental
 */
class VehicleRental { ... }

/**
 * @displayName :singular Line Item
 * @displayName :plural Line Items
 */
items: LineItem[];
```

**Inference cascade** (per PP2 — inference over declaration):

Display names follow a three-tier resolution with increasing explicitness:

1. **Fully implicit** — no `@displayName` tag. The consumer-provided inference function derives both singular and plural forms from the identifier (e.g., `HouseLocation` → "House Location" / "House Locations"). The inference function is configurable per PP11 (consumer-controlled messaging) — the default splits PascalCase/camelCase, but consumers can provide a custom function (e.g., one backed by a proper inflector library -- `inflected`).

2. **Bare `@displayName`** — explicit singular, plural inferred via the consumer's inflector. `@displayName Home` sets the singular to "Home"; the plural is derived automatically (e.g., "Homes").

3. **Explicit variants** — `@displayName :singular Home` + `@displayName :plural Properties`. No inference; both forms are author-specified.

```typescript
class HouseLocation {}
// → inferred: singular "House Location", plural "House Locations"

/** @displayName Home */
class HouseLocation {}
// → explicit singular "Home", inferred plural "Homes"

/**
 * @displayName :singular Home
 * @displayName :plural Properties
 */
class HouseLocation {}
// → fully explicit, no inference
```

Using `:singular` or `:plural` on a primitive field or a non-array, non-class context is a static error.

**Lint diagnostics for display name number agreement:**

- **Warning** if a bare `@displayName` (no specifier) appears to be plural — the inflector checks whether the provided name looks plural and suggests using `:plural` if intentional, or correcting to the singular form. Auto-fixable (D5) when the inflector can confidently derive the singular.
- **Warning** if `@displayName :singular` appears to be plural — likely a copy-paste mistake.
- **Warning** if `@displayName :plural` appears to be singular — likely a mistake in the other direction.
- All three warnings are configurable (severity can be set to `off` per PP9) and bypassable with an inline suppression comment. These are intended to catch mistakes, not enforce a naming convention.

#### `@apiName`

```
value ::= api-identifier
api-identifier ::= [a-z][a-z0-9_]*[a-z0-9]   // default validation; configurable
```

Controls the JSON representation name — the property key used in generated JSON Schema and the key used in `$defs` for named types. The default inference function transforms identifiers to `snake_case` (e.g., `firstName` → `first_name`, `HouseLocation` → `house_location`), but consumers can provide a custom transformation per PP11.

**Validation rules** (configurable per PP9):

- Default format: `snake_case` — lowercase letters, digits, and underscores (`[a-z0-9_]+`)
- Cannot begin or end with `_`
- Maximum length configurable (e.g., 40 characters)
- Consumers can override the validation pattern (e.g., allow `camelCase` or `kebab-case`)

**Lint diagnostics:**

- Error if the value violates the configured format rules
- Warning if a bare `@apiName` (singular context) appears to be plural — suggests using `:singular` explicitly or reviewing the name
- Warning if `@apiName :plural` appears to be singular

**On fields** — bare form only, no specifiers:

```typescript
interface User {
  /** @apiName first_name */
  firstName: string; // JSON Schema property key: "first_name"

  lastName: string; // inferred: "last_name"
}
```

**On classes/interfaces** — same three-tier inference cascade as `@displayName`, with `:singular` and `:plural` variants. The singular form controls the `$defs` key and single-object references; the plural form controls array/collection contexts:

```typescript
class HouseLocation {}
// → inferred: singular "house_location", plural "house_locations"

/** @apiName home */
class HouseLocation {}
// → explicit singular "home", inferred plural "homes"

/**
 * @apiName :singular home
 * @apiName :plural properties
 */
class HouseLocation {}
// → fully explicit, no inference
```

Using `:singular` or `:plural` on a field (as opposed to a class/interface or array field) is a static error.

**Lint diagnostics for API name number agreement:**

- **Warning** if a bare `@apiName` (no specifier) appears to be plural — the inflector checks and suggests using `:plural` if intentional, or correcting to the singular form.
- **Warning** if `@apiName :singular` appears to be plural.
- **Warning** if `@apiName :plural` appears to be singular.
- All configurable/bypassable, same as `@displayName` (see above).

#### `@description`

Same grammar as `@displayName`. Multi-line descriptions are formed by multiple `@description` tags on the same field — they are concatenated with a newline separator. Maximum length is configurable (per PP9), independently from `@displayName` — description limits are typically longer.

**OPEN DECISION:** Should multiple `@description` tags concatenate, or should the last one win? Concatenation is consistent with how TSDoc `@remarks` works in practice, but override semantics (per C1 annotation rule) would have the last one win. Recommendation: concatenate, with the understanding that authors who want to override a base type's description should use exactly one `@description` tag on the derived type.

#### `@placeholder`

Same grammar as `@displayName`. Maximum length is configurable (per PP9) — typically shorter than display names since placeholder text must fit within input fields.

#### `@format`

```
value ::= identifier
```

Known JSON Schema format values: `date`, `time`, `date-time`, `duration`, `email`, `idn-email`, `hostname`, `idn-hostname`, `ipv4`, `ipv6`, `uri`, `uri-reference`, `iri`, `iri-reference`, `uuid`, `regex`, `json-pointer`, `relative-json-pointer`.

Unknown format values are accepted (with an info diagnostic D4) for extensibility, as JSON Schema itself allows unknown formats.

**Note on widget hints:** Renderer-specific widget selection (e.g., "use a slider" or "use radio buttons") is the renderer's responsibility, informed by the field type, constraints, and `@format`. A `@uiWidget` tag can be added as an extension in a future version if needed.

**Note on read-only fields:** TypeScript's `readonly` modifier already conveys read-only semantics and is inferred by the analyzer (PP2). A separate `@readOnly` tag is unnecessary. `@writeOnly` is a rare use case that can be added in a future version if demand materializes.

#### `@defaultValue`

```
value ::= json-value | text-until-end-of-line
```

**Important distinction:** `@defaultValue` documents the value that the system will _imply_ when the property is not explicitly set. This is a schema-level concept — "if this optional field is absent, treat it as X" — not a TypeScript runtime initializer. It appears in the generated JSON Schema as the `default` keyword.

```typescript
interface Settings {
  /** @defaultValue false */
  optIn?: boolean; // absent → system assumes false
}
```

This is distinct from a TypeScript class field initializer (`optIn = false`), which sets a runtime value in memory. The two concepts may coincide, but they serve different audiences: `@defaultValue` informs consumers of the schema (API callers, form renderers, documentation generators), while a field initializer informs the TypeScript runtime.

The extractor first attempts JSON parsing. If the text is not valid JSON, it falls back to treating the content as a string literal. This matches the behavior of TypeScript's own `@defaultValue` documentation tag (S6).

```typescript
/** @defaultValue 0 */ // number default
/** @defaultValue "pending" */ // string default (JSON string)
/** @defaultValue pending */ // also a string default (fallback path)
/** @defaultValue false */ // boolean default
```

**Lint diagnostics:**

- **Error** if `@defaultValue` is applied to a non-optional field. A required field must be explicitly provided — documenting an implied default is contradictory (S8 — optionality is orthogonal to constraints, but a default only makes sense when absence is possible).
- **Warning** if a class field has both a `@defaultValue` tag and a property initializer, and the two values disagree. This catches accidental drift between documented and actual defaults.

**Documentation priority:** This distinction between `@defaultValue` (schema-level "implied if absent"), JSON Schema `default` (annotation for consumers), TypeScript property initializers (runtime value in memory), and default function argument values is a known source of confusion. User-facing documentation must explain this clearly with side-by-side examples showing when these concepts coincide and when they diverge. Expect developers coding hastily to conflate them — the lint rule above catches the most dangerous case (disagreement), but clear docs and prominent callouts in the getting-started guide are the primary defense.

#### `@deprecated`

```
value ::= text-until-end-of-line?
```

The optional text is the deprecation message. When present, it is stored in the `DeprecatedAnnotation` and may be surfaced in IDE hover text.

```typescript
/** @deprecated Use paymentMethod instead */
cardNumber?: string;
```

#### `@example`

```
value ::= text-until-end-of-line | fenced-code-block
```

Multiple `@example` tags on the same field each add an entry to the `examples` array in the IR. The value of each entry is parsed as JSON; if JSON parsing fails, the text is stored as a string.

#### `@group`

```
value ::= text-until-end-of-line
```

The group name. Fields with the same group name are visually co-located in the UI Schema. This does not affect the JSON Schema structure (per C2).

#### `@showWhen`, `@hideWhen`, `@enableWhen`, `@disableWhen`

All four tags share the same condition grammar, corresponding to the four JSON Forms rule effects (`SHOW`, `HIDE`, `ENABLE`, `DISABLE`):

```
value ::= ":" scope "{@link" type-ref "}"
scope ::= identifier              // field name on the enclosing type
type-ref ::= identifier           // name of a type/interface describing the condition schema
```

- `@showWhen` / `@hideWhen` — control **visibility**. The field is present or absent from the rendered form based on the condition.
- `@enableWhen` / `@disableWhen` — control **interactivity**. The field is always visible but becomes read-only/non-interactive when the condition is (not) met.

The condition is expressed as a **type reference** wrapped in `{@link}` that compiles to a JSON Schema via the same pipeline as any other type. This aligns directly with JSON Forms' [`SchemaBasedCondition`](https://jsonforms.io/api/core/interfaces/schemabasedcondition.html) — the scope maps to the JSON pointer for the referenced field, and the type compiles to the condition schema. No expression language, no JSON in comments — conditions are TypeScript types.

The `{@link}` wrapper is required. It provides IDE support (go-to-definition, hover, rename refactoring) via TypeScript's language service, and renders as a clickable hyperlink in API Documenter output. The TSDoc parser resolves the content as a `codeDestination` with a `memberIdentifier`, giving the extractor a structured reference rather than raw text to parse.

**FOLLOW-ON:** Explore language server support (A7) for resolving condition type references natively, which would allow an alternative syntax without `{@link}`. However, `{@link}` would remain supported regardless — it provides value as a clickable documentation link even when the language server is available.

```typescript
// Condition schemas — just types that compile to JSON Schema
interface IsSent { const: "sent" }
interface IsSentOrPaid { enum: ["sent", "paid"] }
interface HasValue { minLength: 1 }  // non-empty string

/** @showWhen :status {@link IsSent} */
trackingNumber?: string;

/** @showWhen :status {@link IsSentOrPaid} */
shippingAddress?: Address;

/** @showWhen :country {@link HasValue} */
region?: string;  // only shown once a country is selected

/** @disableWhen :status {@link IsSent} */
amount?: number;  // visible but non-editable once sent
```

The `scope` must resolve to a field on the same enclosing type. The extractor validates this (ERR-008). The `{@link}` must resolve to a type in scope; the extractor compiles it to JSON Schema and validates it is a valid condition schema.

**Stacking rules (AND semantics):**

Multiple rule tags of the same kind on a single field are ANDed — all conditions must be true for the effect to apply. The generator compiles them into a single JSON Forms rule using `allOf` in the condition schema.

```typescript
/**
 * @showWhen :country {@link HasValue}
 * @showWhen :state {@link HasValue}
 */
city?: string;  // only shown when both country AND state are selected
```

**Invalid combinations (lint errors):**

| Combination                                  | Why invalid                                            | Decidable?             |
| -------------------------------------------- | ------------------------------------------------------ | ---------------------- |
| `@showWhen` + `@hideWhen` on same field      | Contradictory effects on the same axis (visibility)    | Yes — static tag check |
| `@enableWhen` + `@disableWhen` on same field | Contradictory effects on the same axis (interactivity) | Yes — static tag check |

**Valid but constrained combinations:**

| Combination                                | Semantics                                     | Notes                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple `@showWhen` on same field         | AND — all must be true to show                | Compiles to `allOf` condition                                                                                                                                                                                                                                                                                                                 |
| Multiple `@disableWhen` on same field      | AND — all must be true to disable             | Compiles to `allOf` condition                                                                                                                                                                                                                                                                                                                 |
| `@showWhen` + `@disableWhen` on same field | Independent axes — visibility + interactivity | JSON Forms supports only one `rule` per element; this compiles to a SHOW rule with the AND of show conditions, and the disable condition is expressed as a nested element rule or via the renderer's extension mechanism. **OPEN DECISION:** How to handle cross-axis rule combinations given JSON Forms' single-rule-per-element limitation. |

Per C3, all four rule types affect **presentation only** — the field is always present in the JSON Schema regardless of the rule effect. Per C2, no rule alters the schema shape.

---

## 4. Path-Target Syntax

### 4.1 Motivation

Path-target syntax allows a tag applied to a complex-typed field to target a specific subfield. This is the mechanism described in S5 — grammar features that unlock expressiveness across many tags without inventing new ones.

Without path-target syntax, there would be no way to constrain the `value` subfield of a `MonetaryAmount` without creating a separate annotated type alias for every combination of currency and value range. With path-target syntax, constraints are expressed inline at the point of use.

### 4.2 Syntax

A path-target modifier is a `:` followed by an identifier immediately before the tag's value argument:

```
path-modifier ::= ":" identifier
```

The identifier names a direct property of the field's type. Nested paths (`:address.street`) are not supported in this revision.

**OPEN DECISION:** Should multi-level paths (`:address.street`) be supported? Arguments for: enables constraints on deeply nested fields without wrapping each level. Arguments against: increases grammar complexity significantly; authors can instead annotate the intermediate type. Recommendation: defer to a subsequent revision; this document specifies single-level paths only.

### 4.3 Semantics

When a path-target modifier is present:

1. The extractor resolves the field's type to its declaration. **For array fields**, the extractor resolves through the array to the item type — the array is transparent for path targeting, similar to how groups are transparent for schema (C2).
2. It looks up the named subproperty on that type (or on the array's item type).
3. It validates that the tag is applicable to the subproperty's type (S4).
4. It creates a `ConstraintNode` targeted at the subfield, not the field itself.

**Array field behavior:**

Constraints on array fields fall into two categories:

- **Array-level constraints** (`@minItems`, `@maxItems`, `@uniqueItems`) — constrain the array itself (length, uniqueness). No path target needed or accepted.
- **Item-level constraints** (all other constraint tags) — apply uniformly to every element of the array. There is no per-index targeting; a constraint applies to all items or none.

For primitive arrays, item constraints are applied directly — no path target needed since there's no subfield to navigate:

```typescript
/** @maxLength 50 */
tags: string[];  // each tag has maxLength 50 → items: { maxLength: 50 }
```

For complex-typed arrays, path targets navigate into each item's properties:

```typescript
/**
 * @minimum :value 0
 * @pattern :currency ^[A-Z]{3}$
 */
lineItems: MonetaryAmount[];
// → items: { properties: { value: { minimum: 0 }, currency: { pattern: "^[A-Z]{3}$" } } }
```

This compiles to JSON Schema's `items` keyword, which applies its schema to every array element.

In the IR, path-targeted constraints are stored as children of the field's IR node under the `subfield` key, keyed by property name:

```typescript
// IR sketch (see 001 for authoritative types)
{
  kind: "field",
  name: "discount",
  type: { kind: "named", name: "MonetaryAmount" },
  subfieldConstraints: {
    value: [
      { kind: "NumericBoundConstraint", bound: "minimum", value: 4, provenance: { ... } }
    ]
  }
}
```

### 4.4 Examples

```typescript
interface MonetaryAmount {
  value: number;
  currency: string;
}

interface LineItem {
  /**
   * @minimum :value 0
   * @maximum :value 9999999.99
   * @minLength :currency 3
   * @maxLength :currency 3
   * @pattern :currency ^[A-Z]{3}$
   */
  price: MonetaryAmount;
}
```

### 4.5 Interaction with Inheritance

Path-targeted constraints on a base type's field are inherited by derived types that include the same field. If a derived type adds additional path-targeted constraints on the same subfield, they narrow further (per S1). Contradiction detection (S2) applies across inherited and local constraints.

### 4.6 Tags That Accept Path-Target Syntax

Path-target syntax is for **constraint tags only** — tags that narrow the valid value set of a subfield. Annotations (display names, descriptions, defaults, etc.) describe the field itself, not its subfields' values. If a subfield needs annotation, annotate it on the type definition where it's declared.

The following tags accept path-target syntax:

- All constraint tags: `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`, `@minLength`, `@maxLength`, `@pattern`, `@minItems`, `@maxItems`, `@uniqueItems`, `@const`, `@maxSigFig`

The following tags do **not** accept path-target syntax:

- All annotation tags: `@displayName`, `@description`, `@placeholder`, `@format`, `@defaultValue`, `@order` (annotations describe the field, not subfield values — annotate subfields on their type definition instead)
- `@deprecated`, `@example`, `@remarks`, `@see` (documentation tags on the field itself)
- `@group` (structural assignment of the field, not its subfields)
- `@showWhen`, `@hideWhen`, `@enableWhen`, `@disableWhen` (conditional logic applies to the field itself, not a subfield)

---

## 5. Member-Target Syntax

### 5.1 Motivation

Member-target syntax allows a tag to annotate a specific member of a union type, `const enum`, or `enum`. Like path-target syntax, it uses the `:` prefix — the grammar is identical, but the semantics differ: path-target navigates into an object's subfield, while member-target selects a variant of a union.

The two syntaxes are distinguished at resolution time: if the field's type is an object (interface, class, type alias with object literal body), `:name` is resolved as a path-target. If the field's type is a union, enum, or string-literal union, `:name` is resolved as a member-target.

**OPEN DECISION:** Should the two syntaxes be syntactically distinct (e.g., `:.member` vs `:subfield`) to avoid ambiguity when a type is both an object and a discriminated union? The current proposal relies on type resolution to disambiguate. A syntactic distinction would make parsing deterministic before type resolution but adds surface area. Recommendation: keep the single `:` syntax; the grammar is simpler, and ambiguity only arises for discriminated unions that are also object types, which can be handled with a static error when the intent is unclear.

### 5.2 Syntax

Same as path-target — `:` followed by an identifier:

```typescript
/**
 * @displayName :sync Synchronous Processing
 * @displayName :async Asynchronous Processing
 */
mode: 'sync' | 'async';
```

For `const enum`:

```typescript
const enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

/**
 * @displayName :Red Crimson
 * @displayName :Green Emerald
 * @displayName :Blue Sapphire
 */
favoriteColor: Color;
```

For regular `enum`:

```typescript
enum Status {
  Draft = 'draft',
  Sent = 'sent',
}

/**
 * @displayName :Draft Draft Invoice
 * @displayName :Sent Sent to Customer
 */
status: Status;
```

### 5.3 Semantics

Member-target constraints and annotations are stored in the IR as an array on the enum/union member's entry:

```typescript
// IR sketch
{
  kind: "field",
  name: "mode",
  type: { kind: "union", members: ["sync", "async"] },
  memberAnnotations: {
    sync:  [{ kind: "DisplayNameAnnotation", value: "Synchronous Processing" }],
    async: [{ kind: "DisplayNameAnnotation", value: "Asynchronous Processing" }],
  }
}
```

### 5.4 Validation

The extractor validates that the member identifier after `:` is a recognized member of the field's type. Unrecognized member names produce ERR-007. This catches typos at build time, satisfying D4 (actionable diagnostics).

### 5.5 Tags That Accept Member-Target Syntax

The following tags accept `:member` syntax. This syntax is **only valid on string literal union types** (on fields or type aliases) — `enum` and `const enum` types should annotate members directly at the declaration site instead (see §9.4).

| Tag            | Use case                                   | Example                                  |
| -------------- | ------------------------------------------ | ---------------------------------------- |
| `@displayName` | Labeling union members for UI              | `@displayName :draft Draft`              |
| `@description` | Per-member descriptions                    | `@description :draft Not yet submitted`  |
| `@deprecated`  | Deprecating individual members             | `@deprecated :draft Use pending instead` |
| `@apiName`     | Overriding JSON representation of a member | `@apiName :draft pending_draft`          |

**ESLint enforcement:** Using `:member` syntax with any tag not in this list is a static error. Additionally, using `:member` syntax on a field whose type is not a string literal union is a static error — for `enum`/`const enum`, annotate members at the declaration site.

The following tags explicitly **do not** accept member-target syntax:

- All constraint tags (`@minimum`, `@maximum`, etc.) — constraints apply to the field's value as a whole, not per-member
- `@defaultValue` — the default is a specific value (`@defaultValue "draft"`), not a per-member annotation
- `@placeholder`, `@format`, `@order` — field-level annotations
- `@showWhen`, `@hideWhen`, `@enableWhen`, `@disableWhen` — conditional rules apply to the field, not members
- `@group` — structural assignment

---

## 6. Parse Error Taxonomy and Diagnostics

All diagnostic codes are prefixed with a configurable vendor token (per PP10, default `FSP`). The diagnostic structure satisfies D1 (structured), D2 (source-located), D3 (deterministic), D4 (actionable), and D6 (machine-consumable).

Diagnostic codes use a category prefix within the code to group related errors. The format is `<VENDOR>-<CATEGORY><NNN>` where the category indicates the kind of issue:

| Category prefix | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| `1xx`           | **Tag recognition** — unknown tags, missing arguments, disabled tags            |
| `2xx`           | **Value parsing** — malformed numeric, regex, JSON, or date values              |
| `3xx`           | **Type compatibility** — tags applied to incompatible types                     |
| `4xx`           | **Target resolution** — invalid path-target, member-target, or scope references |
| `5xx`           | **Constraint validation** — contradictions, duplicates, conflicts               |

---

### Tag recognition (1xx)

**`<VENDOR>-101`: Unknown tag**
**Severity:** warning (configurable to error or off per PP9)
**Condition:** A tag is encountered that matches FormSpec's `@` prefix convention but is not in the recognized tag inventory.
**Message:** `Unknown FormSpec tag "@{tagName}". Did you mean "@{suggestion}"?`
**Auto-fix (D5):** If a known tag with edit distance ≤ 2 exists, offer to replace.

**`<VENDOR>-102`: Missing required tag argument**
**Severity:** error
**Condition:** A tag that requires an argument (e.g., `@minimum`) has an empty comment body.
**Message:** `"@{tagName}" requires an argument but none was provided.`
**Auto-fix:** None.

**`<VENDOR>-103`: Tag disabled by project configuration**
**Severity:** As configured in `.formspec.yml` (warning by default)
**Condition:** A tag is present but has been disabled via project constraints (PP9).
**Message:** `"@{tagName}" is disabled in this project's FormSpec configuration. Remove the tag or update .formspec.yml.`
**Auto-fix (D5):** Offer to remove the tag from the source.

---

### Value parsing (2xx)

**`<VENDOR>-201`: Invalid numeric value**
**Severity:** error
**Condition:** A numeric tag receives a value that does not parse as a finite number (`NaN`, `Infinity`, or non-numeric text).
**Message:** `"@{tagName}" expects a finite number, but received "{value}".`
**Auto-fix:** None (intent is unclear).

**`<VENDOR>-202`: Invalid non-negative integer**
**Severity:** error
**Condition:** A tag expecting a non-negative integer (`@minLength`, `@maxLength`, `@minItems`, `@maxItems`, `@maxSigFig`) receives a fractional, negative, or non-numeric value.
**Message:** `"@{tagName}" expects a non-negative integer, but received "{value}".`
**Auto-fix (D5):** If the value is a non-negative float (e.g., `1.0`), offer to truncate to integer.

**`<VENDOR>-203`: Invalid regex pattern**
**Severity:** error
**Condition:** The value of `@pattern` does not compile as an ECMAScript regex.
**Message:** `"@pattern" value "{value}" is not a valid ECMAScript regex: {regexError}.`
**Auto-fix:** None.

**`<VENDOR>-204`: Invalid JSON value**
**Severity:** error
**Condition:** A tag expecting a JSON value (`@const`, `@defaultValue` in JSON mode) receives text that is not valid JSON.
**Message:** `"@{tagName}" value is not valid JSON: {jsonError}. Received: "{value}".`
**Auto-fix:** None.

---

### Type compatibility (3xx)

**`<VENDOR>-301`: Tag not applicable to field type**
**Severity:** error
**Condition:** A constraint tag is applied to a field whose TypeScript type is not compatible (S4). For example, `@minLength` on a `number` field.
**Message:** `"@{tagName}" cannot be applied to a field of type "{typeName}". Valid types: {validTypes}.`
**Auto-fix:** None (the author must either change the field type or remove the tag).

---

### Target resolution (4xx)

**`<VENDOR>-401`: Unknown path-target identifier**
**Severity:** error
**Condition:** A path-target `:name` does not correspond to a property of the field's object type (or array item type).
**Message:** `":{propName}" is not a property of type "{typeName}". Known properties: {properties}.`
**Auto-fix (D5):** If a property with edit distance ≤ 2 exists, offer to replace.

**`<VENDOR>-402`: Unknown member-target identifier**
**Severity:** error
**Condition:** A member-target `:name` does not correspond to a recognized member of the field's union/enum type.
**Message:** `":{memberName}" is not a member of type "{typeName}". Known members: {members}.`
**Auto-fix (D5):** If a member with edit distance ≤ 2 exists, offer to replace.

**`<VENDOR>-403`: Tag does not accept targeting syntax**
**Severity:** error
**Condition:** A path-target or member-target modifier is used on a tag that does not accept it (see §4.6 and §5.5).
**Message:** `"@{tagName}" does not support the ":{modifier}" targeting syntax.`
**Auto-fix (D5):** Offer to remove the modifier.

**`<VENDOR>-404`: Member-target on non-union type**
**Severity:** error
**Condition:** A member-target `:name` is used on a field whose type is not a string literal union.
**Message:** `":{memberName}" member-target syntax is only valid on string literal union types. For enum/const enum, annotate members at the declaration site.`
**Auto-fix:** None.

---

### Constraint validation (5xx)

**`<VENDOR>-501`: Constraint contradiction**
**Severity:** error
**Condition:** Two or more constraints on the same field (or subfield) produce a provably empty valid set (S2). For example, `@minimum 10` and `@maximum 5` on the same field.
**Message:** `Constraint contradiction: "@minimum {a}" and "@maximum {b}" cannot both be satisfied ({a} > {b}).`
**Notes:** The diagnostic references both source locations (D2). Both constraint provenance records are included in the structured diagnostic output (D6).

**`<VENDOR>-502`: Duplicate tag**
**Severity:** warning (configurable to error)
**Condition:** The same tag appears more than once on a field where only one instance is meaningful (e.g., two `@minimum` tags without different path/member targets).
**Message:** `Duplicate "@{tagName}" tag. The second occurrence at {location} will be used; the first at {location} is ignored.`
**Auto-fix (D5):** Offer to remove the first occurrence.

**`<VENDOR>-503`: Remarks/description conflict**
**Severity:** info
**Condition:** Both `@description` and `@remarks` are present on the same field.
**Message:** `Both "@description" and "@remarks" are present. "@description" takes precedence. Consider removing "@remarks" to avoid confusion.`
**Auto-fix (D5):** Offer to remove `@remarks`.

**`<VENDOR>-504`: Contradictory rule effects**
**Severity:** error
**Condition:** `@showWhen` + `@hideWhen` or `@enableWhen` + `@disableWhen` on the same field.
**Message:** `Contradictory rule effects: "@{tagA}" and "@{tagB}" cannot both apply to the same field.`
**Auto-fix:** None (the author must choose one).

---

## 7. Access Modifier Semantics

TypeScript access modifiers control the schema extraction boundary:

- **`public` members** (the default) — included in schema extraction. These are the DSL surface.
- **`private` and `protected` members** — invisible to schema extraction. These are "just TypeScript" — helper methods, computed properties, internal state. The analyzer skips them entirely.

This means developers can use private/protected space freely for implementation concerns without worrying about schema impact. Promoting a private member to the schema surface is a matter of changing the access modifier.

```typescript
interface OrderFields {
  subtotalCents: USDCents;     // in schema
  taxCents: USDCents;          // in schema

  // NOT in schema — TypeScript-only convenience
  private get totalCents(): number {
    return this.subtotalCents + this.taxCents;
  }
}
```

---

## 8. How Extraction Maps to Canonical IR Nodes

This section specifies the mapping from parsed tag data to IR node types (as defined in document 001). The extraction pipeline produces a flat list of IR nodes per field, which the canonicalization phase merges and validates.

### 7.1 Constraint tag → `ConstraintNode`

Each constraint tag instance produces one `ConstraintNode`:

```typescript
// Conceptual mapping (see 001 for authoritative IR types)
interface ConstraintNode {
  kind: ConstraintKind; // e.g., "NumericBound", "StringLength", "Pattern"
  bound?: 'minimum' | 'maximum' | 'exclusive-minimum' | 'exclusive-maximum';
  value: number | string | boolean | null;
  path?: string; // Present when path-target syntax used
  member?: string; // Present when member-target syntax used
  provenance: ProvenanceRecord;
}

interface ProvenanceRecord {
  surface: 'tsdoc'; // vs "chain-dsl"
  file: string;
  line: number;
  column: number;
  tagName: string; // e.g., "@minimum"
}
```

### 7.2 Annotation tag → `AnnotationNode`

Each annotation tag instance produces one `AnnotationNode`:

```typescript
interface AnnotationNode {
  kind: AnnotationKind; // e.g., "DisplayName", "Description", "Placeholder"
  value: string | boolean | unknown;
  path?: string; // Present when path-target syntax used
  member?: string; // Present when member-target syntax used
  provenance: ProvenanceRecord;
}
```

### 7.3 Ecosystem tag → specialized nodes

- `@deprecated` → `DeprecatedAnnotation` (boolean + optional message string)
- `@defaultValue` → `DefaultValueAnnotation` (parsed value; type must be assignable to field type — ERR-006 variant)
- `@example` → appended to `ExampleAnnotation[]`

### 7.4 Composition in the IR (per C1)

**Constraints compose by intersection.** When the canonicalization phase encounters multiple `ConstraintNode`s of the same kind on the same field/subfield/member, it:

1. Validates that they do not contradict (S2 — emits ERR-010 if they do)
2. Keeps all constraints (they all apply — the valid set is their intersection)
3. Records both provenance entries in the combined node

**Annotations compose by override.** When multiple `AnnotationNode`s of the same kind exist on the same field, the most-specific one wins. Specificity order (from most to least specific):

1. Tag on the field property declaration itself
2. Tag on the field's type alias (if the field's type is a type alias)
3. Tag on the field's interface/class definition (if the field's type is an interface or class)
4. Tag on a base type (if the type extends or intersects with another type)

---

## 9. Examples

### 9.1 Type Alias Constraint Chains

Type aliases carry TSDoc constraints that compose naturally when used on fields (PP3 — constraint model mirrors TypeScript's type theory). This is the same mental model from primitive type aliases all the way up to complex types.

```typescript
type Integer = number; // special type where we enforce rounding to nearest integer

/** @minimum 0 */
type USDCents = Integer;

/** @minimum 0 @maximum 100 */
type Percent = Integer;

/**
 * @displayName :active   Active
 * @displayName :suspended Suspended
 * @displayName :cancelled Cancelled
 */
type PlanStatus = 'active' | 'suspended' | 'cancelled';
```

These compose when used on fields — the field inherits all constraints from the type alias chain:

```typescript
interface PlanFields {
  premiumCents: USDCents; // inherits @minimum 0 from USDCents
  discountPct: Percent; // inherits @minimum 0, @maximum 100 from Percent
  status: PlanStatus; // enum values + display names from the type
}
```

A field can further narrow inherited constraints (S1), but never broaden:

```typescript
interface SpecialPlan {
  /** @maximum 50 */
  discountPct: Percent; // valid: narrows to [0, 50] from [0, 100]

  /** @minimum -10 */
  premiumCents: USDCents; // ERROR: broadens @minimum 0 inherited from USDCents
}
```

### 9.2 MonetaryAmount with Subfield Constraints

```typescript
interface MonetaryAmount {
  value: number;
  currency: string;
}

interface PaymentForm {
  /**
   * @displayName Payment Amount
   * @description The total amount to charge, including tax.
   * @minimum :value 0.01
   * @maximum :value 999999.99
   * @multipleOf :value 0.01
   * @minLength :currency 3
   * @maxLength :currency 3
   * @pattern :currency ^[A-Z]{3}$
   */
  amount: MonetaryAmount;
}
```

IR produced (abbreviated):

```
FieldIRNode "amount"
  type: NamedTypeRef "MonetaryAmount"
  annotations:
    DisplayNameAnnotation { value: "Payment Amount" }
    DescriptionAnnotation { value: "The total amount to charge, including tax." }
  subfieldConstraints:
    "value":
      NumericBoundConstraint { bound: "minimum", value: 0.01 }
      NumericBoundConstraint { bound: "maximum", value: 999999.99 }
      MultipleOfConstraint { value: 0.01 }
    "currency":
      StringLengthConstraint { bound: "minLength", value: 3 }
      StringLengthConstraint { bound: "maxLength", value: 3 }
      PatternConstraint { pattern: "^[A-Z]{3}$" }
```

### 9.3 User-Defined Constrained Type Alias

Percent is not a built-in — it's a user-defined type alias with constraints, demonstrating how FormSpec consumers build their own domain types (PP8, PP9):

```typescript
/** @minimum 0 @maximum 100 */
type Percent = number;

interface DiscountConfig {
  /**
   * @displayName Discount Percentage
   * @multipleOf 0.5
   * @defaultValue 0
   */
  discountPct: Percent; // inherits [0, 100] from Percent
}
```

### 9.4 Enum Display Names — `enum` and `const enum`

For `enum` and `const enum` types, display names are annotated directly on each member inside the declaration — co-located with the value they describe:

```typescript
enum PaymentCardBrand {
  /** @displayName Visa */
  VISA = 'visa',
  /** @displayName MasterCard */
  MASTERCARD = 'mc',
  /** @displayName American Express */
  AMEX = 'amex',
}

const enum OrderStatus {
  /** @displayName Awaiting Processing */
  Pending = 'pending',
  /** @displayName In Progress */
  Processing = 'processing',
  /**
   * @displayName On Its Way
   * @deprecated Use Delivered instead
   */
  Shipped = 'shipped',
  /** @displayName Complete */
  Delivered = 'delivered',
}
```

This is the preferred form for `enum` and `const enum` — the metadata lives next to the member it describes, just like JSDoc on any other declaration.

### 9.5 Enum Display Names — String Literal Union

String literal unions don't have declaration sites for individual members, so the `:member` syntax on the field or type alias is the only option:

```typescript
/**
 * @displayName Processing Mode
 * @displayName :sync Synchronous
 * @displayName :async Asynchronous
 * @displayName :batch Batch Processing
 * @description :batch Batched nightly at 2am UTC.
 */
mode: 'sync' | 'async' | 'batch';
```

The `:member` syntax also works on type alias unions:

```typescript
/**
 * @displayName :active Active
 * @displayName :suspended Suspended
 * @displayName :cancelled Cancelled
 */
type PlanStatus = 'active' | 'suspended' | 'cancelled';
```

**Summary:** For `enum`/`const enum`, annotate members directly at their declaration site — no `:member` syntax needed. The `:member` syntax exists specifically for string literal unions, which have no per-member declaration site. Both approaches produce the same IR.

### 9.6 Array Field with Item Constraints

```typescript
interface Tag {
  name: string;
  color: string;
}

/**
 * @displayName Tags
 * @minItems 1
 * @maxItems 10
 * @uniqueItems
 * @minLength :name 1
 * @maxLength :name 50
 * @pattern :color ^#[0-9a-fA-F]{6}$
 */
tags: Tag[];
```

---

## Appendix A: Tag Quick Reference

| Tag                 | Category   | Argument        | Path? | Member? |
| ------------------- | ---------- | --------------- | ----- | ------- |
| `@minimum`          | constraint | numeric literal | yes   | no      |
| `@maximum`          | constraint | numeric literal | yes   | no      |
| `@exclusiveMinimum` | constraint | numeric literal | yes   | no      |
| `@exclusiveMaximum` | constraint | numeric literal | yes   | no      |
| `@multipleOf`       | constraint | numeric literal | yes   | no      |
| `@minLength`        | constraint | non-neg int     | yes   | no      |
| `@maxLength`        | constraint | non-neg int     | yes   | no      |
| `@pattern`          | constraint | regex string    | yes   | no      |
| `@minItems`         | constraint | non-neg int     | no    | no      |
| `@maxItems`         | constraint | non-neg int     | no    | no      |
| `@uniqueItems`      | constraint | none (marker)   | no    | no      |
| `@maxSigFig`        | constraint | pos int         | yes   | no      |
| `@const`            | constraint | JSON value      | no    | no      |
| `@displayName`      | annotation | text            | no    | yes     |
| `@apiName`          | annotation | identifier      | no    | no      |
| `@description`      | annotation | text            | no    | no      |
| `@placeholder`      | annotation | text            | no    | no      |
| `@format`           | annotation | identifier      | yes   | no      |
| `@order`            | annotation | integer         | no    | no      |
| `@defaultValue`     | ecosystem  | JSON/text       | yes   | yes     |
| `@deprecated`       | ecosystem  | text?           | no    | yes     |
| `@example`          | ecosystem  | JSON/text       | no    | no      |
| `@remarks`          | ecosystem  | text            | no    | no      |
| `@see`              | ecosystem  | text            | no    | no      |
| `@group`            | structure  | text            | no    | no      |
| `@showWhen`         | structure  | field=value     | no    | no      |
| `@hideWhen`         | structure  | field=value     | no    | no      |
| `@enableWhen`       | structure  | field=value     | no    | no      |
| `@disableWhen`      | structure  | field=value     | no    | no      |
