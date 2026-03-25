# 005 — Numeric Types: Integer, Decimal, and Extension Numerics

This document specifies how FormSpec handles built-in numeric types (`number`), how integer semantics are expressed through `multipleOf: 1` type aliases, and how the extension API enables downstream consumers to introduce custom numeric domains — `Decimal`, `Currency`, `MonetaryAmount`, `DateOnly`, and similar types — without forking FormSpec core. It covers strategic workstream F.

---

## 1. Overview

### Principles Satisfied

| Section                               | Principles              |
| ------------------------------------- | ----------------------- |
| Built-in numeric types                | PP2, PP3, S4, S7, B3    |
| Integer semantics via `multipleOf: 1` | PP3, S1, S2, S4, C1     |
| Extension numeric types               | E1, E2, E3, E4, E5, PP3 |
| Type alias chains                     | PP3, S1, C1             |
| Extension case study: DateOnly        | E1, E5, S5              |
| Extension case study: MonetaryAmount  | S5, PP3, C1, B4         |
| Constraint composition                | S1, S2, C1              |

### Scope and Relationship to Other Documents

This document complements the following:

- **001 (Canonical IR):** The `PrimitiveTypeNode` taxonomy includes `"integer"` as a distinct kind (§2.2). This document specifies how `number` fields with `MultipleOfConstraint(1)` map to that kind and how extensions introduce `CustomTypeNode` entries for types outside the built-in taxonomy.
- **002 (TSDoc Grammar):** The constraint tag table in §2.1 lists `@minimum`, `@maximum`, etc. as extensible to custom numeric types. This document specifies how that extensibility is exercised.
- **003 (JSON Schema Vocabulary):** §6.1 establishes the eight required extension outcomes for `Decimal`. This document provides a concrete walk-through of each outcome.

### Design Philosophy

FormSpec's numeric story is deliberately narrow at the core. One numeric type is built in: `number` (floating-point, maps to JSON Schema `number`). Integer semantics are expressed through user-defined type aliases carrying `@multipleOf 1` — no special `bigint` treatment, no `@integer` tag. Everything else — `Decimal`, `Currency`, `MonetaryAmount`, `DateOnly` — is an extensibility concern.

This narrowness is intentional (PP8: progressive complexity). Simple forms with price fields and quantities work immediately with `number`. Teams with sophisticated numeric requirements — integer-only values, auditable financial precision, string-backed decimal serialization, date-only wire formats — introduce exactly the type aliases or extensions they need. No simple form pays ceremony for capabilities it does not use.

The narrowness also acts as an extensibility pressure test (E1): if a downstream `Decimal` type can be added without privileged access to FormSpec internals, then any domain-specific type can be. The extension API must be expressive enough for `Decimal` to be indistinguishable from a hypothetical built-in.

---

## 2. Built-in Numeric Types

### 2.1 `number` — Floating-Point

TypeScript's `number` type maps directly to JSON Schema `{ "type": "number" }`. No annotation is required; the mapping is inferred (PP2).

```typescript
interface OrderLine {
  /** @minimum 0.01 */
  unitPrice: number;

  /** @minimum 1 @maximum 9999 */
  quantity: number;
}
```

Generated JSON Schema:

```json
{
  "type": "object",
  "properties": {
    "unitPrice": { "type": "number", "minimum": 0.01 },
    "quantity": { "type": "number", "minimum": 1, "maximum": 9999 }
  },
  "required": ["unitPrice", "quantity"]
}
```

**Constraint applicability (S4):** The following built-in constraint tags apply to `number` fields:

| Tag                 | JSON Schema keyword | Notes                         |
| ------------------- | ------------------- | ----------------------------- |
| `@minimum`          | `minimum`           | Inclusive lower bound         |
| `@maximum`          | `maximum`           | Inclusive upper bound         |
| `@exclusiveMinimum` | `exclusiveMinimum`  | Exclusive lower bound         |
| `@exclusiveMaximum` | `exclusiveMaximum`  | Exclusive upper bound         |
| `@multipleOf`       | `multipleOf`        | Value must be a multiple of n |

Applying a string constraint (`@minLength`, `@pattern`) to a `number` field is a static error (D1-class diagnostic). Applying `@minimum` to a `string` field is a static error. The type determines the valid tag vocabulary.

**Precision note (B3):** `number` carries no precision guarantee beyond IEEE 754 double precision. Consumers with precision requirements beyond what `number` provides should define a custom type (see §4). The system does not silently introduce precision-affecting behavior on `number` fields.

### 2.2 Integer Semantics via `multipleOf: 1`

FormSpec does not give `bigint` special treatment. Authors who want integer semantics should define a `number` type alias annotated with `@multipleOf 1`:

```typescript
/** @multipleOf 1 */
type Integer = number;
```

The analyzer detects `multipleOf: 1` on a `number` field and emits `{ "type": "integer" }` in the generated JSON Schema rather than `{ "type": "number", "multipleOf": 1 }`. This gives a clean schema output while keeping the source representation in the TypeScript type system (PP3).

There is no `@integer` tag in FormSpec. Integer semantics are expressed through the type alias pattern above — the `@multipleOf 1` constraint carries the information; a dedicated tag would be redundant and create a surface for disagreement (PP2).

**`bigint` note:** FormSpec does not map `bigint` to JSON Schema `integer`. Authors who want integer semantics should use `number` with `@multipleOf 1` as shown above. `bigint` fields are treated as unrecognized types and produce a diagnostic.

---

## 3. Integer Semantics via Type Aliases

### 3.1 The `Integer` Type Alias Pattern

Integer semantics in FormSpec come from a user-defined type alias, not from a built-in type or special annotation. The canonical pattern is:

```typescript
/** @multipleOf 1 */
type Integer = number;
```

The analyzer sees a `number` field with a `MultipleOfConstraint(1)` and a named type reference. The generator detects `multipleOf: 1` on a `number` and emits `{ "type": "integer" }` in the JSON Schema output rather than `{ "type": "number", "multipleOf": 1 }`. The named type flows through `$defs`/`$ref` like any other named type (PP7).

**Chain DSL path:** The chain DSL exposes `field.integer(name)` as a convenience for integer fields. Internally this records `{ kind: "primitive", primitiveKind: "integer" }` in the form element — equivalent to a `number` field whose resolved alias carries `MultipleOfConstraint(1)`.

### 3.2 IR Representation

The IR captures the integer semantic at the `PrimitiveTypeNode` level. Named aliases appear as `ReferenceTypeNode` entries in the `$defs` registry — the primitive kind lives inside the resolved definition, not on the reference itself.

```typescript
// Canonical IR for `amount: USDCents` with `@minimum 1`

// In the $defs registry:
{
  "USDCents": {
    kind: "reference",
    name: "module#USDCents",
    typeArguments: []
    // resolves to:
    // { kind: "primitive", primitiveKind: "integer" }
  }
}

// FieldNode for `amount`:
{
  name: "amount",
  type: { kind: "reference", name: "module#USDCents", typeArguments: [] },
  optional: false,
  constraints: [
    {
      kind: "constraint",
      constraintKind: "minimum",
      value: 1,
      provenance: { surface: "tsdoc", file: "...", line: 12, column: 5 }
    }
  ],
  annotations: [],
  provenance: { surface: "tsdoc", file: "...", line: 12, column: 3 }
}
```

The constraint `minimum: 1` is valid because constraint applicability checking resolves `USDCents` through the alias chain to `{ primitiveKind: "integer" }`, which is in the numeric constraint applicability set (S4).

### 3.3 Generator Emission

The JSON Schema generator emits `{ "type": "integer" }` when it encounters a `PrimitiveTypeNode` with `primitiveKind: "integer"`. Named types that resolve to `"integer"` are emitted as `$defs` entries with `{ "type": "integer" }` and referenced via `$ref` (PP7).

```typescript
// TypeScript source
/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 */
type USDCents = Integer;
```

Generated `$defs`:

```json
{
  "$defs": {
    "Integer": { "type": "integer" },
    "USDCents": {
      "allOf": [{ "$ref": "#/$defs/Integer" }, { "minimum": 0 }]
    }
  }
}
```

The `allOf` + `$ref` pattern (003 §7.2) handles constraint narrowing at each level of the alias chain. `USDCents` inherits the `integer` type from `Integer` and adds `@minimum 0`. A field of type `USDCents` inherits both (PP3, S1, C1).

### 3.4 Type Alias Patterns

The most common patterns for consumer-defined integer types:

**Base integer alias:**

```typescript
/** @multipleOf 1 */
type Integer = number;
```

This is the idiomatic base integer type. Fields that need integer semantics but no domain-specific constraints use this alias directly.

**Domain-specific integer aliases:**

```typescript
/** @minimum 0 */
type USDCents = Integer;

/** @minimum 1 @maximum 65535 */
type PortNumber = Integer;

/** @minimum 0 @maximum 100 */
type Percentage = Integer;
```

These inherit `Integer`'s `multipleOf: 1` constraint and add domain-specific refinements (PP3). A field typed as `Percentage` resolves through the alias chain to `{ primitiveKind: "integer" }` with range [0, 100].

**Contradiction detection (S2):** The analyzer detects contradictions in the constraint chain at build time. If a derived type attempts to broaden a bound inherited from the base:

```typescript
/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 */
type NonNegativeInteger = Integer;

/** @minimum -100 */ // ERROR: cannot broaden @minimum beyond NonNegativeInteger's bound
type BroadenedInteger = NonNegativeInteger;
```

This produces a D1-class diagnostic: `CONSTRAINT_BROADENING — @minimum -100 is less restrictive than inherited @minimum 0 from NonNegativeInteger. Constraints can only narrow, not broaden (S1).`

---

## 4. Extension Numeric Types

FormSpec does not ship a `Decimal` type. This section explains why and demonstrates how the extension API enables a consumer to introduce it with full parity to built-in types.

### 4.1 Why Decimal is Downstream

A `Decimal` type requires decisions FormSpec cannot make on behalf of consumers:

1. **Wire format:** Is `Decimal` serialized as a JSON string (`"1234.56"`), a JSON number (`1234.56`), or an object with `mantissa`/`exponent` parts? Different consumers have different requirements and interoperability constraints.
2. **Precision library:** Counting significant figures, performing arithmetic, comparing values — these require a precision library (`decimal.js`, `big.js`, `Intl.NumberFormat`, bigint-based arithmetic). FormSpec cannot prescribe which library a consumer uses.
3. **Rounding policy (B3):** When a decimal value with more precision than allowed must be constrained, how is precision loss handled? `"error"`, `"warn"`, `"allow"` — this is a high-stakes consumer decision, especially in financial contexts.
4. **JSON Schema representation:** A string-backed decimal has `{ "type": "string" }` in JSON Schema plus a custom vocabulary keyword for precision constraints. A number-backed decimal has `{ "type": "number" }` plus `multipleOf`. The right choice depends on the consumer's schema consumers.

These decisions are domain-specific, not FormSpec concerns. Decimal is therefore a downstream concern and an intentional extensibility pressure test (E1): if a consumer can introduce `Decimal` — with its own constraint tags, custom vocabulary keywords, Ajv validators, and ESLint rules — then the extension API is sufficiently expressive for any custom numeric domain.

### 4.2 Extension API Function Signatures

The extension API is exposed from `@formspec/core`. These are the public contracts extension authors depend on:

```typescript
// --- Top-level entry point ---

interface ExtensionConfig {
  /** Unique identifier for the extension. Used in IR nodes and configuration keys. */
  name: string;
  types?: CustomTypeRegistration<string>[];
  constraintTags?: ConstraintTagRegistration[];
  constraintTagBroadening?: void[]; // broadenConstraintTag returns void
  vocabularyKeywords?: VocabularyKeywordRegistration[];
}

declare function defineExtension(config: ExtensionConfig): Extension;

// --- Custom type registration ---

interface CustomTypeConfig<T extends string> {
  /** The TypeScript type name as it appears in source. */
  typeName: T;
  /** The npm package module path where the type is declared. */
  typeModule: string;
  /** Base JSON Schema emitted for bare fields of this type (no constraints). */
  jsonSchemaBase: Record<string, unknown>;
  /** IR node emitted for fields of this type. */
  irNode: { kind: 'custom'; typeId: string; payload: Record<string, unknown> };
}

declare function defineCustomType<T extends string>(
  config: CustomTypeConfig<T>
): CustomTypeRegistration<T>;

// --- Constraint tag introduction ---

interface ConstraintTagConfig {
  tag: `@${string}`;
  /** "set-influencing" narrows the valid value set; "annotation" is metadata-only. */
  kind: 'set-influencing' | 'annotation';
  /** How multiple occurrences compose. "intersection" = tightest wins (C1). */
  composition: 'intersection' | 'override';
  /** Returns an error descriptor if `proposed` broadens `inherited`, else null. */
  contradictionCheck: (
    inherited: unknown,
    proposed: unknown
  ) => { kind: 'error'; message: string } | null;
  applicableTypes: string[];
  valueParser: (raw: string) => unknown;
  irNode: (value: unknown) => {
    kind: 'constraint';
    constraintKind: 'custom';
    extensionId: string;
    value: unknown;
  };
}

declare function defineConstraintTag(
  config: ConstraintTagConfig
): ConstraintTagRegistration;

// --- Broadening an existing built-in constraint tag ---

interface BroadenConfig {
  /** The existing built-in tag to broaden (e.g., "@minimum"). */
  tag: `@${string}`;
  /** Additional type names the tag should become applicable to. */
  additionalTypes: string[];
  /** Custom value parser for these types (e.g., to preserve decimal precision). */
  valueParser: (raw: string) => unknown;
}

declare function broadenConstraintTag(config: BroadenConfig): void;

// --- Custom JSON Schema vocabulary keyword ---

interface VocabularyKeywordConfig {
  /** The logical keyword name (vendor prefix is injected at registration time). */
  logicalName: string;
  /** "validation" affects whether a value is accepted; "annotation" is metadata only. */
  kind: 'validation' | 'annotation';
  /** The JSON Schema type of the keyword's schema value. */
  schemaType: 'integer' | 'number' | 'string' | 'boolean' | 'array' | 'object';
  /** The IR constraint extensionId that triggers emission of this keyword. */
  emitFrom: string;
}

declare function defineVocabularyKeyword(
  config: VocabularyKeywordConfig
): VocabularyKeywordRegistration;
```

### 4.3 Walk-Through: All Eight Extension Outcomes

The following walk-through is keyed to the eight required outcomes from 003 §6.1. A consumer implementing a `Decimal` type must achieve all eight without forking FormSpec core.

**Outcome 1: Define a custom type that participates in the type system.**

The consumer defines a branded string type and registers it with FormSpec:

```typescript
// In the consumer's extension package: @myorg/formspec-decimal

declare const _decimal: unique symbol;
/** A string-serialized decimal number. Wire format: "1234.5678" */
export type Decimal = string & { readonly [_decimal]: true };

// Extension registration (see E5 — extensions are npm packages with
// the "formspec-extension" keyword in their package.json)
import { defineExtension, defineCustomType } from '@formspec/core';

export default defineExtension({
  name: 'decimal',
  types: [
    defineCustomType({
      typeName: 'Decimal',
      // The module path where the TypeScript type is declared.
      // The analyzer uses this to recognize `Decimal` fields in user code.
      typeModule: '@myorg/formspec-decimal',
      // How to emit this type in JSON Schema.
      // For string-backed decimal, the JSON Schema type is "string".
      jsonSchemaBase: { type: 'string' },
      // The IR node to use for this type.
      irNode: { kind: 'custom', typeId: 'x-myorg/decimal/Decimal', payload: {} },
    }),
  ],
});
```

After registration, the analyzer recognizes fields typed as `Decimal` and includes them in the IR as `CustomTypeNode` entries. The generator emits `{ "type": "string" }` (the `jsonSchemaBase`) for bare `Decimal` fields, with additional custom keywords added when constraints are present.

**Outcome 2: Broaden existing built-in constraint tags to apply to the custom type.**

The extension declares that `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, and `@multipleOf` are valid on `Decimal` fields. The extension provides a parser for decimal-literal tag values (since the built-in parser works with `number` precision; decimals may exceed this):

```typescript
import { defineExtension, broadenConstraintTag } from '@formspec/core';

export default defineExtension({
  name: 'decimal',
  // ...
  constraintTagBroadening: [
    broadenConstraintTag({
      tag: '@minimum',
      additionalTypes: ['Decimal'],
      // The extension provides its own value parser for decimal literals.
      // The built-in parser would use Number() and lose precision.
      valueParser: parseDecimalLiteral,
    }),
    broadenConstraintTag({
      tag: '@maximum',
      additionalTypes: ['Decimal'],
      valueParser: parseDecimalLiteral,
    }),
    broadenConstraintTag({
      tag: '@exclusiveMinimum',
      additionalTypes: ['Decimal'],
      valueParser: parseDecimalLiteral,
    }),
    broadenConstraintTag({
      tag: '@exclusiveMaximum',
      additionalTypes: ['Decimal'],
      valueParser: parseDecimalLiteral,
    }),
    broadenConstraintTag({
      tag: '@multipleOf',
      additionalTypes: ['Decimal'],
      valueParser: parseDecimalLiteral,
    }),
  ],
});
```

After this registration, applying `@minimum 0.01` to a `Decimal` field is valid, not a type-compatibility error. The ESLint rule that enforces `@minimum` is only valid on numeric types learns about `Decimal` from the registration; no changes to the rule are needed.

**Outcome 3: Introduce a new custom constraint tag.**

The consumer introduces `@maxSigFig` — a new constraint tag that limits the number of significant figures a decimal value may carry:

```typescript
import { defineExtension, defineConstraintTag } from '@formspec/core';

export default defineExtension({
  name: 'decimal',
  // ...
  constraintTags: [
    defineConstraintTag({
      tag: '@maxSigFig',
      // Set-influencing: narrows the valid value set (C1)
      kind: 'set-influencing',
      // Composition rule: intersection — lower maxSigFig wins (S1, C1)
      composition: 'intersection',
      // Contradiction check: if inherited maxSigFig < proposed maxSigFig, error (S2)
      contradictionCheck: (inherited, proposed) =>
        proposed > inherited
          ? {
              kind: 'error',
              message: `@maxSigFig ${proposed} is broader than inherited @maxSigFig ${inherited}`,
            }
          : null,
      applicableTypes: ['Decimal'],
      valueParser: (raw) => {
        const n = parseInt(raw, 10);
        if (isNaN(n) || n <= 0) throw new Error('@maxSigFig requires a positive integer');
        return n;
      },
      irNode: (value) => ({
        kind: 'constraint',
        constraintKind: 'custom',
        extensionId: 'x-myorg/decimal/maxSigFig',
        value,
      }),
    }),
  ],
});
```

The `defineConstraintTag` call provides all information FormSpec needs to:

- Validate `@maxSigFig` is only used on `Decimal` fields (S4)
- Detect contradictions when the tag appears on a derived type that already has a tighter bound (S2)
- Preserve provenance for diagnostic messages (S3)
- Compose with other constraints via intersection (C1)

**Outcome 4: Write ESLint rules with minimal boilerplate.**

FormSpec's ESLint plugin base provides rule infrastructure for constraint validation. The consumer writes only the extension-specific logic:

```typescript
// In the extension's ESLint plugin
import { createConstraintTagRule } from '@formspec/eslint-plugin/base';

// This rule validates @maxSigFig usage without reimplementing
// type resolution, path-target syntax, provenance tracking, or
// contradiction detection infrastructure.
export const maxSigFigRule = createConstraintTagRule({
  tag: '@maxSigFig',
  applicableTypes: ['Decimal'],
  valueParser: parsePositiveInt,
  contradictionCheck: (accumulated, proposed) =>
    proposed > accumulated
      ? `@maxSigFig ${proposed} cannot broaden inherited @maxSigFig ${accumulated}`
      : null,
});
```

The `createConstraintTagRule` factory handles the boilerplate: tag location extraction, type applicability checking, path-target resolution, provenance attachment, diagnostic emission (D1–D4). The extension provides the domain-specific decisions.

**Outcome 5: Custom vocabulary keyword in JSON Schema output.**

The extension registers a custom JSON Schema keyword for `@maxSigFig`. The generator emits it when the constraint is present:

```typescript
import { defineExtension, defineVocabularyKeyword } from '@formspec/core';

export default defineExtension({
  name: 'decimal',
  // ...
  vocabularyKeywords: [
    defineVocabularyKeyword({
      // The keyword name uses the configured vendor prefix (E3).
      // At registration time the vendor prefix from .formspec.yml is
      // substituted; the extension sees the logical name.
      logicalName: 'maxSigFig',
      // This keyword validates — it affects whether a value is accepted.
      kind: 'validation',
      schemaType: 'integer',
      // The IR constraint kind that triggers emission of this keyword.
      emitFrom: 'x-myorg/decimal/maxSigFig',
    }),
  ],
});
```

Output for a `Decimal` field with `@minimum 0.01` and `@maxSigFig 8`:

```json
{
  "type": "string",
  "x-myorg-maxSigFig": 8,
  "x-myorg-minimum": "0.01"
}
```

Note that `@minimum` on a `Decimal` field emits as `x-myorg-minimum` (a custom keyword with a string value) rather than the standard `minimum` keyword (which applies to JSON numbers). The extension's `jsonSchemaBase` of `{ "type": "string" }` makes this correct — the validation keyword validates the string representation, not a JSON number.

**Outcome 6: Ajv validator for runtime validation.**

The extension provides Ajv keyword definitions in a separate entry point, isolated per A8:

```typescript
// @myorg/formspec-decimal/ajv-keywords
import type { KeywordDefinition } from 'ajv';

export const maxSigFigKeyword: KeywordDefinition = {
  keyword: 'x-myorg-maxSigFig',
  type: 'string',
  schemaType: 'integer',
  validate: function validateMaxSigFig(schema: number, data: string): boolean {
    // Consumer provides their own precision library here.
    // FormSpec provides no opinion on how to count sig figs.
    const sigFigs = countSignificantFigures(data);
    return sigFigs <= schema;
  },
  errors: true,
};

export const minimumDecimalKeyword: KeywordDefinition = {
  keyword: 'x-myorg-minimum',
  type: 'string',
  schemaType: 'string',
  validate: function validateDecimalMinimum(schema: string, data: string): boolean {
    return compareDecimal(data, schema) >= 0;
  },
  errors: true,
};
```

Consumers who need runtime validation install both the extension and Ajv:

```bash
pnpm add @myorg/formspec-decimal ajv
```

Consumers who only need schema generation install only the extension (no Ajv dependency at build time, consistent with A8).

**Outcome 7: Constraint inheritance works identically to built-in types.**

Type alias chains composed from `Decimal` work the same way as chains from built-in numeric types (PP3):

```typescript
/** @maxSigFig 8 */
type Decimal8 = Decimal;

/** @minimum 0 */
type PositiveDecimal8 = Decimal8; // inherits @maxSigFig 8

/** @minimum 0.01 */
type PositiveDecimalCents = PositiveDecimal8; // inherits @minimum 0 and @maxSigFig 8

interface Invoice {
  /** @maximum 999999.99 */
  total: PositiveDecimalCents; // inherits @minimum 0.01, @maxSigFig 8; adds @maximum 999999.99
}
```

Contradiction detection operates on the full chain (S2). If a derived type attempts to broaden:

```typescript
/** @maxSigFig 12 */ // ERROR: cannot broaden — Decimal8 already sets @maxSigFig 8
type WideDecimal = Decimal8;
```

This produces: `CONSTRAINT_BROADENING — @maxSigFig 12 is broader than inherited @maxSigFig 8 from Decimal8. Constraints can only narrow (S1).`

**Outcome 8: Configurable precision-loss policy.**

The extension supports the B3 configurable-lossy-transformation requirement:

```yaml
# Consumer's .formspec.yml
extensions:
  decimal:
    precisionLoss: 'error' # default: fail on precision loss
    # precisionLoss: "warn"   # allow with diagnostic
    # precisionLoss: "allow"  # allow silently (not recommended for financial use)
```

The `precisionLoss` policy is consulted at schema generation time when a `Decimal` field's value must be narrowed to a fixed precision. The extension reads the configuration via the FormSpec extension configuration API and adjusts its behavior accordingly.

---

## 5. Extension Case Study: DateOnly

`DateOnly` follows the same extension pattern as `Decimal` — a consumer defines `type DateOnly = string` with `@format date` in the `jsonSchemaBase` and introduces `@before`/`@after` as extension-provided constraint tags (introduced by the date extension, not built into FormSpec core) using `broadenConstraintTag`. This demonstrates that the extension API is not specific to numeric types. See 003 §6 for the extensibility acceptance criteria that govern both cases.

---

## 6. Extension Case Study: MonetaryAmount

`MonetaryAmount` is a regular TypeScript interface that FormSpec handles natively. It shows how subfield constraint targeting (S5) composes with numeric constraints on an object type — no extension is needed.

```typescript
interface MonetaryAmount {
  value: number;
  currency: string;
}

/**
 * A monetary amount always in USD.
 * @const :currency "USD"
 */
type USDAmount = MonetaryAmount;

interface Payment {
  /**
   * @displayName Total Amount
   * @minimum :value 0.01
   * @maximum :value 9999999.99
   * @multipleOf :value 0.01
   */
  charge: USDAmount; // inherits @const :currency "USD"; adds numeric bounds on :value
}
```

Generated JSON Schema:

```json
{
  "$defs": {
    "MonetaryAmount": {
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "currency": { "type": "string" }
      },
      "required": ["value", "currency"]
    },
    "USDAmount": {
      "allOf": [
        { "$ref": "#/$defs/MonetaryAmount" },
        { "properties": { "currency": { "const": "USD" } } }
      ]
    }
  },
  "properties": {
    "charge": {
      "allOf": [
        { "$ref": "#/$defs/USDAmount" },
        {
          "properties": {
            "value": { "minimum": 0.01, "maximum": 9999999.99, "multipleOf": 0.01 }
          }
        }
      ],
      "title": "Total Amount"
    }
  },
  "required": ["charge"]
}
```

Subfield constraint targeting (S5) directs `:value` constraints to the `value: number` property; constraint applicability is evaluated against the subfield's type, not the parent. The `allOf` + `$ref` chain accumulates constraints from each alias level — `USDAmount` fixes the currency, and the use-site annotation adds the numeric bounds on the value.

---

## 7. Numeric Constraint Composition

### 7.1 Intersection of Multiple Bounds

Multiple numeric constraints on the same field (or accumulated through the type alias chain) compose via intersection (S1, C1). Every constraint must hold simultaneously:

```typescript
/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 */
type NonNegative = Integer;

/** @maximum 100 */
type Capped = NonNegative; // range: [0, 100]

interface Config {
  /** @minimum 10 */
  threshold: Capped; // range: [10, 100] — @minimum 10 further narrows the [0, 100] range
}
```

The effective range for `threshold` is [10, 100]. Constraints from each level are preserved separately in the IR with their provenance (S3), then evaluated together during constraint validation.

### 7.2 Contradiction Detection for Numeric Bounds (S2)

The analyzer detects infeasible numeric constraint sets at build time. Contradiction detection is decidable for built-in numeric constraints (S2). The following are detected:

**Inverted bounds:**

```typescript
/** @minimum 10 @maximum 5 */ // ERROR: @minimum 10 > @maximum 5
count: number;
```

**Exclusive bound violations:**

```typescript
/** @exclusiveMinimum 10 @maximum 10 */ // ERROR: no value satisfies x > 10 AND x ≤ 10
value: number;
```

**Broadening through an alias chain:**

```typescript
/** @multipleOf 1 @minimum 5 */
type LowBound = number;

/** @minimum 0 */ // ERROR: @minimum 0 < inherited @minimum 5 — cannot broaden
type Broadened = LowBound;
```

**`multipleOf` incompat with bounds:**

`multipleOf` contradictions with bounds are detected when no multiple of the given step falls within the allowed range:

```typescript
/** @minimum 0 @maximum 0.5 @multipleOf 1 */ // ERROR: no integer multiple of 1 in [0, 0.5]
fractional: number;
```

Note: the `multipleOf` contradiction check applies only when bounds are also present on the same field or alias chain. A bare `@multipleOf` without bounds is not itself contradictory.

### 7.3 Composition Across the Alias Chain

Constraints from different levels of the alias chain are composed by the analyzer before contradiction detection runs. The composition follows the merge rules from 001 §7:

1. Collect all `NumericConstraintNode` entries from the full alias chain (from base type to use site)
2. Separate by `constraintKind`
3. For `minimum` / `exclusiveMinimum`: take the maximum of all values (highest lower bound wins — narrowing)
4. For `maximum` / `exclusiveMaximum`: take the minimum of all values (lowest upper bound wins — narrowing)
5. For `multipleOf`: if multiple `multipleOf` values are present, emit them all (JSON Schema allows multiple `multipleOf` — a value is valid only if it is a multiple of all stated values)
6. Check the merged bounds for feasibility (step 7.2)

This composition is performed in the Validate phase of the pipeline (A5), after all IR nodes have been produced by the Canonicalize phase.

---

## Appendix: Open Decisions Summary

| #    | Section | Question                                                                                                                                                             | Status                                                                                                    |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| OD-1 | §3.1    | Should type alias resolution be eager (at analysis time) or lazy (at generation time)?                                                                               | Eager — resolved at Canonicalize phase to enable Validate phase contradiction detection                   |
| OD-2 | §3.3    | Should the generator emit `{ "type": "integer" }` or `{ "type": "number", "multipleOf": 1 }` for aliases with `MultipleOfConstraint(1)`?                             | `{ "type": "integer" }` — cleaner output; the `multipleOf: 1` constraint is the source of truth in the IR |
| OD-3 | §4.3    | Should `broadenConstraintTag` be a compile-time registration or a runtime registration?                                                                              | Compile-time, via extension npm package loaded at build time (E5)                                         |
| OD-4 | §6      | When a type alias inherits subfield constraints, should the generator always emit `allOf` + `$ref`, or inline when the alias adds only a single subfield constraint? | Always `allOf` + `$ref` for consistency and high-fidelity output (PP7)                                    |
