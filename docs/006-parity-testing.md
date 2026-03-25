# 006 — Parity Testing Strategy

This document specifies the test strategy for verifying that FormSpec's two authoring surfaces — TSDoc-annotated types and the chain DSL — produce semantically equivalent output for the same intent. It covers strategic workstream E.

---

## 1. Overview

### Principles Satisfied

| Section                       | Principles       |
| ----------------------------- | ---------------- |
| What parity means             | PP5, A1, A3, A4  |
| Canonical test fixtures       | PP3, S1, S5, C1  |
| TSDoc ↔ Chain DSL equivalence | PP5, A3, A4, NP1 |
| IR comparison infrastructure  | A2, A3, A4, D3   |
| JSON Schema output comparison | A3, PP6, PP7     |
| Extensibility stress tests    | E1, E4, E5       |
| Diagnostic consistency        | D1, D3, D4, PP5  |

### What Parity Means

**PP5** states: _"The TSDoc-annotated type surface and the chain DSL surface are alternative syntaxes for the same semantic model for the shared static feature set. Enumerated exceptions are allowed only when this specification calls them out explicitly. Outside those explicit exceptions, neither surface has capabilities the other lacks."_

**A3** states: _"Given an identical canonical IR, JSON Schema and UI Schema generators produce identical output."_

Together, these properties define two testable equivalences:

1. **Surface → IR parity:** The TSDoc extractor and the chain DSL canonicalizer, given equivalent author intent, must produce structurally equivalent canonical IR. This is the primary parity property.

2. **IR → Output parity (A3):** This is a derived consequence. If two IR instances are structurally equivalent, and generation is a pure function of the IR, then their JSON Schema output is identical. Testing A3 amounts to testing that the generator has no ambient state or configuration leakage between runs.

Parity is **not** about bit-for-bit identical IR objects. The IR records surface-specific provenance metadata (A4) — `{ surface: "tsdoc", file: "...", line: 4 }` vs `{ surface: "chain-dsl", callsite: "..." }`. These are expected to differ. Parity tests exclude provenance fields from comparison.

**NP1** defines the scope boundary: _"No decorator-based authoring."_ The decorator DSL is removed. Parity tests cover exactly two surfaces: TSDoc and chain DSL. There is no decorator parity surface to test.

**Enumerated parity exceptions in this revision:**

- dynamic option retrieval against a statically known field
- runtime-discovered JSON Schema
- runtime-discovered UI schema

These are ChainDSL-owned capabilities in this revision. They are excluded from strict TSDoc ↔ ChainDSL parity.

**Mixed-authoring note:** Some near-term product scenarios are not pure parity cases. In particular, a form may be authored primarily as a TSDoc-annotated class while using ChainDSL-only constructs for a small number of dynamic option fields. Those cases should be covered by dedicated mixed-authoring composition tests, not by strict TSDoc ↔ ChainDSL parity tests. The assertion target for such tests is correct generated JSON Schema and UI Schema for the composed form, not identical IR from two independently authored surfaces. The composition mechanism must remain explicit; decorators are not a substitute authoring surface.

**User-authored testing note:** End-to-end coverage should also demonstrate how adopters test their own systems. Those tests split into three different categories:

- data-model conformance tests: does example payload data validate against the generated JSON Schema?
- dynamic-option tests: does resolver-driven option retrieval return values compatible with the field's stored type?
- dynamic-schema tests: does resolver logic correctly transform source data into JSON Schema and JSON Forms UI schema fragments?

These are confidence tests for user integrations, not parity tests.

### Relationship to Other Documents

- **001 (Canonical IR):** Parity tests compare `FieldNode` and `ConstraintNode` instances by structural equality on semantic fields. This document relies on 001's IR type definitions.
- **002 (TSDoc Grammar):** Each shared static TSDoc tag in the tag inventory (§2) has a corresponding chain DSL option. Runtime-capable ChainDSL-only constructs are excluded from parity and instead covered by mixed-authoring composition tests.
- **003 (JSON Schema Vocabulary):** Parity at the JSON Schema output level verifies A3. The test fixtures from this document exercise the full mapping in 003 §2.
- **005 (Numeric Types):** Extension stress-test fixtures (`Decimal`, `DateOnly`) validate that parity holds across the extension boundary — not just for built-in types.

---

## 2. Canonical Test Fixtures

The test fixtures are a small, carefully selected set of TypeScript types that collectively exercise every parity-relevant capability. Each fixture is designed to stress a specific composition or inference behavior.

### 2.1 Fixture Design Criteria

A good parity fixture:

- Exercises at least one non-trivial IR property (constraint inheritance, subfield targeting, enum display names, alias chains)
- Is compact enough to be readable as a test
- Produces a non-trivial but fully predictable IR that can be written by hand as a test expectation
- Has a clear, natural corresponding expression in both TSDoc and chain DSL

### 2.2 Fixture: USDCents

**What it tests:** integer semantics derived from a `number` alias in TSDoc, type alias constraint inheritance (PP3), bounded integer type.

Source: see 005 §3 for the TypeScript definition and JSON Schema output.

**What this fixture tests that 005 does not show:** the chain DSL surface for `USDCents` fields, and the IR shape produced when both surfaces process the alias chain.

**Why this is a good fixture:** It exercises the full type alias chain (`quantity: USDCents` inherits `@minimum 0` from `USDCents` and `@maximum 99_999_999_999_999` from `Integer`) and adds a use-site `@minimum 1` refinement. The expected IR for `quantity` has three numeric constraints from three different provenance levels. The expected IR for `unitPrice` has two constraints from the alias chain with no use-site additions.

Under the current integer model, `Integer` is represented in the IR as `{ kind: "primitive", primitiveKind: "integer" }`. On the TSDoc surface this commonly originates from a `number` alias carrying `@multipleOf 1`, but the canonical model treats the result as integer, not as a plain number with an output-only optimization.

**Expected IR excerpt for `quantity`:**

```typescript
{
  name: "quantity",
  type: { kind: "reference", name: "module#USDCents", typeArguments: [] },
  required: true,
  constraints: [
    { kind: "constraint", constraintKind: "minimum",   value: 0,              /* from USDCents */ },
    { kind: "constraint", constraintKind: "maximum",   value: 99999999999999, /* from Integer */ },
    { kind: "constraint", constraintKind: "multipleOf", value: 1,             /* from Integer — integer semantics */ },
    { kind: "constraint", constraintKind: "minimum",   value: 1,              /* use-site */ },
  ],
  annotations: [
    { kind: "annotation", annotationKind: "displayName", value: "Quantity" }
  ]
}
```

### 2.3 Fixture: Percent

**What it tests:** integer type derivation and refinement with [0, 100] range, `@multipleOf` composition on an integer-valued field, contradiction detection between use-site and alias chain.

```typescript
// TSDoc surface
/** @maximum 99_999_999_999_999 */
type Integer = number;

/**
 * @minimum 0
 * @maximum 100
 */
type Percent = Integer;

interface Promotion {
  /**
   * @displayName Discount
   * @multipleOf 5
   */
  discountPercent: Percent;
}
```

**Why this is a good fixture:** `discountPercent` inherits bounds from `Percent` (which inherits `@maximum` and integer semantics from `Integer`) and adds a `@multipleOf 5` constraint at the use site. The use-site `@maximum 100` from `Percent` overrides the `Integer` alias chain's `@maximum 99_999_999_999_999` in the effective bound — testing that the Validate phase takes the minimum of all upper bounds. The `@multipleOf 1` on `Integer` and `@multipleOf 5` at the use site compose to an effective `multipleOf: 5` (since every multiple of 5 is also a multiple of 1).

### 2.4 Fixture: PlanStatus

**What it tests:** String literal union (enum) with `@displayName` per-member annotation, `oneOf` with `const`/`title` JSON Schema output, `@defaultValue`.

```typescript
// TSDoc surface
/**
 * @displayName Plan Status
 * @displayName :active Active
 * @displayName :paused Paused
 * @displayName :cancelled Cancelled
 * @defaultValue active
 */
type PlanStatus = 'active' | 'paused' | 'cancelled';

interface Subscription {
  status: PlanStatus;
}
```

**Why this is a good fixture:** Per-member display names use the member-target grammar from S5. The generated JSON Schema must use `oneOf` with per-member `const`/`title` rather than a flat `enum` (see 003 §2.3). The `@defaultValue` annotation must appear at the `status` field level in the schema output, not inside the `PlanStatus` `$defs` entry.

**Expected JSON Schema for `status`:**

```json
{
  "$ref": "#/$defs/PlanStatus",
  "default": "active"
}
```

```json
{
  "$defs": {
    "PlanStatus": {
      "oneOf": [
        { "const": "active", "title": "Active" },
        { "const": "paused", "title": "Paused" },
        { "const": "cancelled", "title": "Cancelled" }
      ],
      "title": "Plan Status"
    }
  }
}
```

### 2.5 Fixture: Address

**What it tests:** Object type with nested constraints, `$defs` + `$ref` for a reusable type, multi-field required/optional mix.

```typescript
// TSDoc surface
interface Address {
  /**
   * @displayName Street
   * @minLength 1
   * @maxLength 200
   */
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

  /** @displayName Postal Code */
  postalCode?: string;
}

interface CustomerForm {
  /** @displayName Billing Address */
  billing: Address;

  /** @displayName Shipping Address */
  shipping?: Address;
}
```

**Why this is a good fixture:** The `Address` type appears twice in `CustomerForm` — once required and once optional — exercising the `$defs` + `$ref` deduplication (PP7, 003 §5.1). The `country` field has three constraints that compose correctly.

### 2.6 Fixture: MonetaryAmount with Subfield Targeting

**What it tests:** Subfield constraint targeting via `:path` grammar (S5), `allOf` + `$ref` emission for constrained object fields, pattern constraints on string subfields.

Source: see 005 §6.2 for the TypeScript definition and JSON Schema output for `total` and `discount`.

**What this fixture tests that 005 does not show:** the chain DSL surface for `total` and `discount` using `subfieldConstraints`, and the IR-level parity between the TSDoc extractor and the chain DSL canonicalizer for path-targeted constraints.

**Why this is a good fixture:** The `:value` and `:currency` path targets exercise the path-target grammar. The `total` field has four constraints targeting two different subfields, requiring the generator to emit an `allOf` with multiple property-level constraints (003 §5.4). This is the most structurally complex single-field case in the fixture suite.

---

## 3. TSDoc ↔ Chain DSL Equivalence Test Patterns

For each fixture, both the TSDoc surface and the chain DSL surface are authored, then compared. The test verifies that both produce structurally equivalent canonical IR (excluding provenance fields).

### 3.1 Fixture Layout

Parity test fixtures follow this directory layout:

```
packages/build/src/__tests__/parity/
  fixtures/
    usd-cents/
      tsdoc.ts          ← TSDoc-surface TypeScript source
      chain-dsl.ts      ← Equivalent chain DSL definition
      expected-ir.ts    ← Hand-authored expected IR (no provenance)
      expected-schema.json  ← Hand-authored expected JSON Schema
    percent/
      ...
    plan-status/
      ...
    address/
      ...
    monetary-amount/
      ...
  usd-cents.test.ts
  percent.test.ts
  plan-status.test.ts
  address.test.ts
  monetary-amount.test.ts
```

### 3.2 USDCents: Both Surfaces

**TSDoc surface (`usd-cents/tsdoc.ts`):**

```typescript
/** @maximum 99999999999999 */
type Integer = number;

/** @minimum 0 */
type USDCents = Integer;

interface LineItem {
  /** @displayName Unit Price */
  unitPrice: USDCents;

  /**
   * @displayName Quantity
   * @minimum 1
   * @maximum 9999
   */
  quantity: USDCents;
}
```

**Chain DSL surface (`usd-cents/chain-dsl.ts`):**

```typescript
import { field, formspec } from '@formspec/dsl';

// The chain DSL expresses constraint inheritance through type references.
// The DSL consumer names the type and the build pipeline resolves it to
// the same IR that the TSDoc extractor produces.
// Integer semantics are expressed through the named type reference —
// the "Integer" $defs entry resolves to JSON Schema type "integer".

const lineItemForm = formspec(
  field.number('unitPrice', { displayName: 'Unit Price', type: 'USDCents' }),
  field.number('quantity', {
    displayName: 'Quantity',
    type: 'USDCents',
    minimum: 1,
    maximum: 9999,
  })
);

export { lineItemForm };
```

**Note on chain DSL type references:** The chain DSL references type names (e.g., `type: "USDCents"`) that are resolved against the project's registered type aliases. The type alias registration (`USDCents = Integer = number` with bounds, where `Integer` canonicalizes to integer semantics) is defined in a shared configuration file and loaded by the build pipeline. This is how constraint inheritance propagates through the chain DSL: the type name carries the alias chain's constraints.

### 3.3 PlanStatus: Both Surfaces

**TSDoc surface (`plan-status/tsdoc.ts`):**

```typescript
/**
 * @displayName Plan Status
 * @displayName :active Active
 * @displayName :paused Paused
 * @displayName :cancelled Cancelled
 */
type PlanStatus = 'active' | 'paused' | 'cancelled';

interface Subscription {
  /** @defaultValue active */
  status: PlanStatus;
}
```

**Chain DSL surface (`plan-status/chain-dsl.ts`):**

```typescript
import { field, formspec } from '@formspec/dsl';

const subscriptionForm = formspec(
  field.enum('status', ['active', 'paused', 'cancelled'] as const, {
    displayName: 'Plan Status',
    defaultValue: 'active',
    memberDisplayNames: {
      active: 'Active',
      paused: 'Paused',
      cancelled: 'Cancelled',
    },
  })
);

export { subscriptionForm };
```

### 3.4 MonetaryAmount: Both Surfaces

**TSDoc surface (`monetary-amount/tsdoc.ts`):** See 005 §6.2 for the full TypeScript definition. The fixture file reproduces that definition verbatim; it is not duplicated here.

**Chain DSL surface (`monetary-amount/chain-dsl.ts`):**

```typescript
import { field, formspec } from '@formspec/dsl';

const invoiceForm = formspec(
  field.object('total', {
    displayName: 'Total Amount',
    type: 'MonetaryAmount',
    subfieldConstraints: {
      value: { minimum: 0.01, maximum: 9999999.99, multipleOf: 0.01 },
      currency: { pattern: '^[A-Z]{3}$' },
    },
  }),
  field.object('discount', {
    type: 'MonetaryAmount',
    optional: true,
    subfieldConstraints: {
      value: { minimum: 0 },
    },
  })
);

export { invoiceForm };
```

### 3.5 Test Assertion Pattern

Each parity test follows the same structure:

```typescript
// monetary-amount.test.ts
import { describe, it, expect } from 'vitest';
import { extractFormIR } from '@formspec/build/internals';
import { canonicalizeDSL } from '@formspec/build/internals';
import { compareIR } from '../helpers/ir-comparison';
import { invoiceForm } from './fixtures/monetary-amount/chain-dsl';
import { expectedIR } from './fixtures/monetary-amount/expected-ir';

describe('parity: MonetaryAmount', () => {
  it('TSDoc surface produces expected IR', async () => {
    const ir = await extractFormIR('./fixtures/monetary-amount/tsdoc.ts');
    expect(compareIR(ir, expectedIR)).toEqual({ equivalent: true, differences: [] });
  });

  it('Chain DSL surface produces expected IR', () => {
    const ir = canonicalizeDSL(invoiceForm);
    expect(compareIR(ir, expectedIR)).toEqual({ equivalent: true, differences: [] });
  });

  it('Both surfaces produce identical IR', async () => {
    const tsdocIR = await extractFormIR('./fixtures/monetary-amount/tsdoc.ts');
    const chainIR = canonicalizeDSL(invoiceForm);
    expect(compareIR(tsdocIR, chainIR)).toEqual({ equivalent: true, differences: [] });
  });
});
```

The three-test pattern is intentional:

1. **TSDoc → expected IR:** Verifies the TSDoc extractor is working correctly against a hand-written expected value. If this fails, the issue is in extraction.
2. **Chain DSL → expected IR:** Verifies the chain DSL canonicalizer is working correctly. If this fails, the issue is in canonicalization.
3. **TSDoc → chain DSL (cross-surface):** The key parity test. If (1) and (2) pass but (3) fails, there is an inconsistency in the expected IR — the two surfaces agree with each other but disagree with the hand-written expectation. This should not happen in practice but catches expected-IR maintenance errors.

---

## 4. IR Comparison Infrastructure

### 4.1 The `compareIR` Helper

The `compareIR` function compares two `FormIR` instances structurally, excluding provenance fields. It returns a structured result rather than throwing directly, enabling the test to report which fields differ:

```typescript
// packages/build/src/__tests__/helpers/ir-comparison.ts

export interface IRComparisonResult {
  equivalent: boolean;
  differences: IRDifference[];
}

export interface IRDifference {
  path: string; // JSON pointer to the differing location, e.g. "/fields/0/constraints/1/value"
  expected: unknown; // value from the first argument
  actual: unknown; // value from the second argument
}

/**
 * Compares two FormIR instances for semantic equivalence.
 * Provenance fields are excluded from the comparison (A4).
 *
 * @see 001 §3 for the IR type definitions
 * @see 006 §4 for the comparison semantics
 */
export function compareIR(a: FormIR, b: FormIR): IRComparisonResult {
  const stripped_a = stripProvenance(a);
  const stripped_b = stripProvenance(b);
  return deepCompare(stripped_a, stripped_b);
}
```

### 4.2 Provenance Exclusion

Provenance fields are defined in 001 §5 and include:

- `provenance.surface` — `"tsdoc"` vs `"chain-dsl"`
- `provenance.file`, `provenance.line`, `provenance.column` — source location
- `provenance.callsite` — chain DSL call stack information

Fields that are _not_ excluded:

- All constraint fields: `constraintKind`, `value`, `bound`
- All annotation fields: `annotationKind`, `value`
- All type node fields: `kind`, `primitiveKind`, `members`, `properties`, etc.
- All field-level fields: `name`, `required`, `constraints`, `annotations`
- All IR metadata: `formId`, `fields`, `defs`

Rather than a generic recursive walk, provenance stripping is a **typed IR transformation** that operates at the known, fixed positions where provenance appears in the IR:

- `FieldNode.provenance`
- `ConstraintNode.provenance` (inside `FieldNode.constraints[n]`)
- `AnnotationNode.provenance` (inside `FieldNode.annotations[n]`)
- `LayoutNode.provenance`

The transformation type is `ProvenanceFree<FieldNode>`, which is `Omit<FieldNode, "provenance">` with each nested node type similarly stripped. Because provenance appears at these specific depths — not recursively at arbitrary depth — the implementation targets each position explicitly rather than traversing the full object graph. This preserves the TypeScript type information through the transformation: the result type is fully typed, not `unknown`, and the compiler catches any missed provenance fields at each IR node kind.

### 4.3 Snapshot Testing vs Structural Assertion Trade-offs

| Approach                                        | Pros                                                                          | Cons                                                                              | When to use                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Snapshot (`.toMatchSnapshot()`)                 | Low maintenance; catches regressions automatically; no hand-writing           | Snapshots are brittle; failures require manual snapshot review; semantics unclear | Regression detection for large IR structures                         |
| Structural assertion (hand-written expected IR) | Intent is explicit and readable; failures clearly describe what changed       | Requires hand-writing and maintaining expected values                             | Canonical parity tests where the expected value is the specification |
| `compareIR` helper                              | Structured diff output; provenance excluded by design; clear failure messages | More infrastructure than a simple `expect().toEqual()`                            | Parity tests comparing two IR instances                              |

**Decision:** Canonical parity fixtures use hand-written expected IR (the `expected-ir.ts` files). The hand-written expected values serve as the specification for what the correct IR looks like. Snapshot tests are not part of the normative parity strategy.
Structural assertions fail with specific field-path information that makes the cause immediately clear.

### 4.4 Fields Compared in Detail

The parity test comparison covers these semantic fields:

**FieldNode:** `name`, `required`, `constraints` (order-normalized), `annotations` (order-normalized), `type` (structural)

**ConstraintNode:** `kind`, `constraintKind`, `value` (for numeric constraints, compared with tolerance-free exact equality — see §4.5), `pattern` (for pattern constraints), `bound`, `extensionId` (for custom constraints)

**AnnotationNode:** `kind`, `annotationKind`, `value`

**TypeNode:** `kind`, `primitiveKind` (primitives), `members` (enum/union — order-sensitive), `properties` (objects — order-preserved per D3), `items` (arrays), `name` + `typeArguments` (references), `typeId` + `payload` (custom)

**FormIR root:** `formId`, `fields` (order-sensitive), `defs` (key-sorted for determinism, per D3)

### 4.5 Numeric Precision in Comparisons

Constraint values for large integer constraints may exceed `Number.MAX_SAFE_INTEGER`. These are stored as strings in the IR (see 005 §3.1). The comparison helper uses string equality for such values:

```typescript
function compareConstraintValue(a: ConstraintValue, b: ConstraintValue): boolean;
```

The semantics: if both values are strings (large-integer-origin), string equality is used. If both are numbers (float-origin), numeric equality is used. A string/number type mismatch is not equivalent. No floating-point tolerance is applied. Constraint values are exact literals that the author wrote; two constraints with values `0.01` and `0.010` are different (the IR stores the parsed value, not the literal text, for `number`-origin constraints, so `0.010` parses to the same `number` as `0.01` — this is expected behavior and the comparison correctly treats them as equal).

---

## 5. JSON Schema Output Comparison

### 5.1 Testing the A3 Property

**A3** states: _"Given an identical canonical IR, JSON Schema and UI Schema generators produce identical output."_

Testing A3 requires:

1. Two IR instances that `compareIR` reports as equivalent (provenance-stripped)
2. Running the generator on both
3. Asserting the JSON Schema outputs are exactly equal (not just semantically equivalent — structurally identical, including key order and formatting)

```typescript
// monetary-amount.test.ts (continued)
import fs from 'node:fs';
import path from 'node:path';
import { generateJsonSchema } from '@formspec/build';

const expectedSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/monetary-amount/expected-schema.json'),
    'utf-8'
  )
);

describe('A3 parity: MonetaryAmount', () => {
  it('both surfaces produce identical JSON Schema', async () => {
    const tsdocIR = await extractFormIR('./fixtures/monetary-amount/tsdoc.ts');
    const chainIR = canonicalizeDSL(invoiceForm);

    const tsdocSchema = generateJsonSchema(tsdocIR);
    const chainSchema = generateJsonSchema(chainIR);

    // A3: same IR → same output (exact structural equality)
    expect(tsdocSchema).toEqual(chainSchema);

    // Also verify against the hand-authored expected schema
    expect(tsdocSchema).toEqual(expectedSchema);
  });

  it('generator is pure: same IR produces same output on repeated calls', () => {
    const ir = canonicalizeDSL(invoiceForm);

    const output1 = generateJsonSchema(ir);
    const output2 = generateJsonSchema(ir);
    const output3 = generateJsonSchema(ir);

    expect(output1).toEqual(output2);
    expect(output2).toEqual(output3);
  });
});
```

### 5.2 Key Ordering and Determinism (D3)

The generator must produce deterministic output (D3). This means:

- `$defs` keys are sorted alphabetically
- `properties` keys are ordered by their declaration order in the source TypeScript (preserved through the IR)
- `required` arrays are sorted alphabetically (order does not affect semantics, but determinism requires a canonical order)
- `oneOf`/`anyOf` member arrays preserve the order from the TypeScript union declaration

JSON Schema output tests use `toEqual` (deep structural equality), which for plain objects in JavaScript treats key order as insignificant. This is correct for semantic equivalence. However, the generator's determinism test additionally checks that serialized output (via `JSON.stringify`) is identical between runs:

```typescript
it('serialized output is deterministic across runs', () => {
  const ir1 = canonicalizeDSL(invoiceForm);
  const ir2 = canonicalizeDSL(invoiceForm);

  const json1 = JSON.stringify(generateJsonSchema(ir1));
  const json2 = JSON.stringify(generateJsonSchema(ir2));

  expect(json1).toBe(json2); // string equality, not deep equality
});
```

### 5.3 Output Comparison Against Hand-Authored Expected Schemas

Each fixture's `expected-schema.json` is authored by hand and committed to the repository. It serves as the specification for what the correct output looks like. The test verifies that both surfaces produce output that matches this specification.

The `expected-schema.json` files are subject to review in pull requests. Changes to these files signal a change to the observable output contract and must be intentional.

---

## 6. Extensibility Stress-Test Fixtures

Extension types (`Decimal`, `DateOnly`) are included in the parity test suite as first-class fixtures. They verify that parity holds across the extension boundary — not just for built-in types. If the extension API is correctly implemented (E1), extension types should be indistinguishable from built-in types in parity tests.

### 6.1 Decimal Fixture

**What it exercises:** Extension type registration (E5), constraint tag broadening for `@minimum`/`@maximum` on `Decimal`, custom `@maxSigFig` constraint tag, custom vocabulary keyword `x-myorg-maxSigFig` in JSON Schema output.

**TSDoc surface (`decimal/tsdoc.ts`):** See 005 §4.2 (Outcome 7) for the `Decimal8` and `PositiveDecimal8` alias chain definitions. The fixture file extends that definition with the `PricingRule` interface; the alias chain source is not duplicated here.

**Chain DSL surface (`decimal/chain-dsl.ts`):**

```typescript
import { field, formspec } from '@formspec/dsl';

const pricingRuleForm = formspec(
  field.custom('baseRate', {
    typeName: 'PositiveDecimal8',
    displayName: 'Base Rate',
    minimum: '0.01',
    maximum: '999999.99',
  }),
  field.custom('overrideRate', {
    typeName: 'PositiveDecimal8',
    optional: true,
    displayName: 'Override Rate',
    minimum: '0',
    maximum: '999999.99',
    maxSigFig: 4,
  })
);

export { pricingRuleForm };
```

**What parity verification checks:**

1. `baseRate` IR has `minimum: "0.01"` (string, not number — decimal precision preserved per B3), `maximum: "999999.99"`, and inherits `maxSigFig: 8` and `minimum: "0"` from the alias chain.
2. `overrideRate` IR has `maxSigFig: 4` at the use site, which is a valid narrowing of the inherited `maxSigFig: 8` (S1).
3. Effective `maxSigFig` for `overrideRate` is `4` — the minimum of the use-site and inherited values.
4. JSON Schema output includes `x-myorg-maxSigFig: 8` for `baseRate` and `x-myorg-maxSigFig: 4` for `overrideRate`.

**Contradiction test within the Decimal fixture:**

```typescript
// Included in the diagnostic consistency section (§7) for the Decimal fixture
/** @maxSigFig 12 */ // ERROR: cannot broaden inherited @maxSigFig 8
type BroadDecimal = Decimal8;
```

Both the TSDoc extractor and the chain DSL canonicalizer must produce equivalent diagnostics for this contradiction (see §7).

### 6.2 DateOnly Fixture

**What it exercises:** Non-numeric extension type, `@before`/`@after` constraint tag broadening, `format: "date"` from the type's `jsonSchemaBase` registration, optional fields, constraint intersection for date bounds.

**TSDoc surface (`date-only/tsdoc.ts`):**

```typescript
import type { DateOnly } from '@myorg/formspec-date-only';

interface AuditPeriod {
  /**
   * @displayName Period Start
   * @after 2000-01-01
   */
  startDate: DateOnly;

  /**
   * @displayName Period End
   * @after 2000-01-01
   * @before 2099-12-31
   */
  endDate: DateOnly;

  /**
   * @displayName Reviewed On
   * @after 2000-01-01
   */
  reviewedOn?: DateOnly;
}
```

**Chain DSL surface (`date-only/chain-dsl.ts`):**

```typescript
import { field, formspec } from '@formspec/dsl';

const auditPeriodForm = formspec(
  field.custom('startDate', {
    typeName: 'DateOnly',
    displayName: 'Period Start',
    after: '2000-01-01',
  }),
  field.custom('endDate', {
    typeName: 'DateOnly',
    displayName: 'Period End',
    after: '2000-01-01',
    before: '2099-12-31',
  }),
  field.custom('reviewedOn', {
    typeName: 'DateOnly',
    optional: true,
    displayName: 'Reviewed On',
    after: '2000-01-01',
  })
);

export { auditPeriodForm };
```

**What parity verification checks:**

1. All three fields have `type: "string"` and `format: "date"` in JSON Schema output — sourced from the type's `jsonSchemaBase`, not from per-field `@format` annotations.
2. `endDate` has two date bound constraints that compose correctly.
3. `reviewedOn` is marked optional (absent from `required`).
4. The `DateOnly` type is lifted to `$defs` and referenced via `$ref` in each field (PP7).

### 6.3 What Extension Fixtures Validate About E1

If both the Decimal and DateOnly parity tests pass:

- Extension type registration works correctly (Outcome 1 from 003 §6.1)
- Constraint tag broadening works for both numeric and non-numeric domains (Outcome 2)
- Custom constraint tags compose identically to built-in constraints (Outcome 3)
- Alias chain inheritance works for extension types exactly as for built-in types (Outcome 7)
- JSON Schema output includes custom vocabulary keywords (Outcome 5)

This satisfies the E1 ("built-in types use the same extension API") acceptance criteria. Extension types are not second-class citizens in the test suite.

---

## 7. Diagnostic Consistency Tests

**PP5** requires that both surfaces have the same semantic model for the shared static feature set. This extends to error behavior: the same invalid input through both shared surfaces must produce equivalent diagnostics — same diagnostic codes and same severity.

### 7.1 What "Equivalent Diagnostics" Means

Two diagnostic sets are equivalent when:

- They contain the same number of diagnostics
- Diagnostics are matched by `code` (machine-readable identifier, e.g., `CONSTRAINT_BROADENING`)
- For matched diagnostics: `severity` is identical
- Message text and `fixSuggestion` are verified separately against surface-appropriate expected values; they are not part of parity comparison
- **Excluded from comparison:** `location` (file, line, column) — the TSDoc surface points to a comment in a `.ts` file; the chain DSL surface points to a method call site. Surface-specific source locations are expected and intentional (A4).

### 7.2 Contradiction Test Pattern

```typescript
// packages/build/src/__tests__/parity/diagnostics.test.ts

import { describe, it, expect } from 'vitest';
import { extractWithDiagnostics } from '@formspec/build/internals';
import { canonicalizeWithDiagnostics } from '@formspec/build/internals';
import { compareDiagnostics } from '../helpers/diagnostic-comparison';

describe('diagnostic parity: constraint broadening', () => {
  it('inverted numeric bounds', async () => {
    // TSDoc: @minimum 10 @maximum 5 on the same number field
    const tsdocDiagnostics = await extractWithDiagnostics(
      './fixtures/diagnostics/inverted-bounds-tsdoc.ts'
    );

    // Chain DSL: field.number("x", { minimum: 10, maximum: 5 })
    const chainDiagnostics = canonicalizeWithDiagnostics(invertedBoundsDSLForm);

    expect(compareDiagnostics(tsdocDiagnostics, chainDiagnostics)).toEqual({
      equivalent: true,
      differences: [],
    });
  });

  it('@maxSigFig broadening through alias chain (Decimal extension)', async () => {
    // Both surfaces should produce CONSTRAINT_BROADENING with
    // severity: "error" and reference both constraint locations
    const tsdocDiagnostics = await extractWithDiagnostics(
      './fixtures/diagnostics/decimal-maxsigfig-broadening-tsdoc.ts'
    );
    const chainDiagnostics = canonicalizeWithDiagnostics(decimalBroadeningDSLForm);

    expect(compareDiagnostics(tsdocDiagnostics, chainDiagnostics)).toEqual({
      equivalent: true,
      differences: [],
    });

    // Also verify the diagnostic code and severity directly
    expect(tsdocDiagnostics).toHaveLength(1);
    expect(tsdocDiagnostics[0]).toMatchObject({
      code: 'CONSTRAINT_BROADENING',
      severity: 'error',
    });
  });
});
```

### 7.3 Diagnostic Comparison Helper

```typescript
// packages/build/src/__tests__/helpers/diagnostic-comparison.ts

export interface DiagnosticComparisonResult {
  equivalent: boolean;
  differences: DiagnosticDifference[];
}

export interface DiagnosticDifference {
  index: number; // index into the sorted diagnostic array
  field: string; // which field differs: "code", "severity", "message", etc.
  expected: unknown;
  actual: unknown;
}

/**
 * Compares two diagnostic arrays for semantic equivalence.
 * Source locations (file, line, column) are excluded from comparison.
 * Diagnostics are sorted by code before comparison for determinism (D3).
 *
 * @see 000-principles.md D1–D6 for diagnostic property requirements
 */
export function compareDiagnostics(
  a: readonly Diagnostic[],
  b: readonly Diagnostic[]
): DiagnosticComparisonResult;

// sortDiagnostics: sorts a diagnostic array by `code` using locale-aware string ordering.
// Used internally to normalize order before element-wise comparison (D3).
function sortDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[];
```

### 7.4 Diagnostic Test Cases by Category

Each category of diagnostic is covered by at least one parity test:

| Category                         | Example input                                              | Expected code              | Parity tested |
| -------------------------------- | ---------------------------------------------------------- | -------------------------- | ------------- |
| Numeric contradiction            | `@minimum 10 @maximum 5`                                   | `CONSTRAINT_CONTRADICTION` | Yes           |
| Broadening attempt               | `@minimum 0` on `NonNegative` (inherits `@minimum 5`)      | `CONSTRAINT_BROADENING`    | Yes           |
| Wrong type for tag               | `@minLength` on `number` field                             | `TYPE_MISMATCH`            | Yes           |
| Unknown tag                      | `@unsupportedTag`                                          | `UNKNOWN_TAG`              | Yes           |
| Extension-specific contradiction | `@maxSigFig 12` on `Decimal8` (inherits `@maxSigFig 8`)    | `CONSTRAINT_BROADENING`    | Yes           |
| Missing required display names   | Enum with member display names on some but not all members | `INCOMPLETE_DISPLAY_NAMES` | Yes           |

---

## 8. Test Organization

### 8.1 File Naming Conventions

| Test file pattern                                      | Purpose                                  |
| ------------------------------------------------------ | ---------------------------------------- |
| `src/__tests__/parity/*.test.ts`                       | Surface parity tests (TSDoc ↔ chain DSL) |
| `src/__tests__/parity/fixtures/*/tsdoc.ts`             | TSDoc surface fixture                    |
| `src/__tests__/parity/fixtures/*/chain-dsl.ts`         | Chain DSL surface fixture                |
| `src/__tests__/parity/fixtures/*/expected-ir.ts`       | Hand-authored expected IR                |
| `src/__tests__/parity/fixtures/*/expected-schema.json` | Hand-authored expected JSON Schema       |
| `src/__tests__/parity/diagnostics.test.ts`             | Diagnostic consistency across surfaces   |
| `src/__tests__/parity/a3-purity.test.ts`               | Generator purity (A3)                    |
| `src/__tests__/helpers/ir-comparison.ts`               | `compareIR` helper                       |
| `src/__tests__/helpers/diagnostic-comparison.ts`       | `compareDiagnostics` helper              |

### 8.2 Location in the Monorepo

Parity tests live in `@formspec/build` because:

1. The build package owns both the TSDoc extractor and the JSON Schema generator — the full pipeline from source to output.
2. The chain DSL canonicalizer is part of `@formspec/build` (it canonicalizes `FormSpec<Elements>` to the canonical IR).
3. Testing parity requires invoking the TypeScript compiler API (for TSDoc extraction), which is a dependency of `@formspec/build` and not available in lighter packages.

Extension fixture tests (`Decimal`, `DateOnly`) are in `@formspec/build`'s test suite but depend on extension packages defined in the monorepo's test fixtures directory:

```
packages/build/src/__tests__/
  parity/
    fixtures/
      decimal/          ← uses @formspec/test-fixtures/decimal
      date-only/        ← uses @formspec/test-fixtures/date-only

packages/test-fixtures/   ← private package, not published
  src/
    decimal/
      index.ts            ← Decimal type + extension registration
    date-only/
      index.ts            ← DateOnly type + extension registration
```

The `@formspec/test-fixtures` package is `"private": true` and is never published. It exists solely to support parity and extensibility tests.

### 8.3 Relationship to Existing Test Infrastructure

The existing test infrastructure in the monorepo uses Vitest. Parity tests follow the same conventions:

```bash
# Run only parity tests
pnpm --filter @formspec/build run test -- --testPathPattern=parity

# Run all build package tests (including parity)
pnpm --filter @formspec/build run test

# Type-level tests for IR types (tsd)
pnpm --filter @formspec/build run test:types
```

The `expected-ir.ts` fixture files use TypeScript types from `@formspec/core`. This gives the hand-authored expected values the benefit of TypeScript's type checker: a malformed expected IR is a compile error, not a silent test failure.

### 8.4 CI Considerations

Parity tests run in the same CI job as unit tests (no separate job needed). The `@formspec/build` package must be built before its tests run (as noted in the root `CLAUDE.md`):

```bash
pnpm run build && pnpm --filter @formspec/build run test
```

Extension fixture tests that depend on `@formspec/test-fixtures` are included in the same job — the private fixtures package is part of the workspace and is built in the normal build order.

### 8.5 Maintenance Obligations

When adding a new TSDoc tag or chain DSL option:

1. Add the tag/option to the appropriate canonical fixture (or create a new fixture if it tests a new concern)
2. Update `expected-ir.ts` and `expected-schema.json` for all affected fixtures
3. Add or update the corresponding parity test assertions
4. If the new tag has an error path, add a diagnostic consistency test case (§7.4)

The `expected-ir.ts` and `expected-schema.json` files are the specification. Changes to them are breaking changes to the observable contract and must be reviewed carefully.

---

## Appendix: Open Decisions Summary

| #    | Section  | Question                                                                                                                                           | Status                                                                                                                                                                                                                                                                                                                                                   |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-1 | §3.2     | How does the chain DSL express type alias constraint inheritance — by name reference resolved at build time, or by explicit constraint repetition? | By name reference — `type: "USDCents"` loads the alias chain from the project's type registry                                                                                                                                                                                                                                                            |
| OD-2 | §4.3     | Should snapshot tests be part of parity validation?                                                                                                 | **DECIDED:** No — snapshots are not part of the normative parity strategy; parity uses hand-authored expectations and structural assertions only                                                                                                                                                                                                          |
| OD-3 | §6, §8.2 | Should extension fixture packages (`@formspec/test-fixtures`) be in `packages/` or alongside the tests?                                            | **DECIDED:** In `packages/test-fixtures/` as a private, unpublished workspace package. This allows the fixture extensions to have their own `package.json`, `tsconfig.json`, and build step, while remaining clearly separated from distributable code. Tests in `packages/build/src/__tests__/` reference the fixture package via workspace dependency. |
| OD-4 | §7.1     | Should diagnostic message text be compared character-for-character, or only code + severity?                                                       | Code + severity in parity comparison; message text is verified separately against expected values                                                                                                                                                                                                                                                        |
