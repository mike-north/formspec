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
- declaration-level `@discriminator` specialization on object-like TSDoc declarations

The first three are ChainDSL-owned capabilities in this revision. They are excluded from strict TSDoc ↔ ChainDSL parity.

`@discriminator` is a deliberate TSDoc-only exception for v1. It is covered by the TSDoc extraction, schema-generation, and tooling tests, but it does not require a matching ChainDSL surface until the spec explicitly adds one.

**Mixed-authoring note:** Some near-term product scenarios are not pure parity cases. In particular, a form may be authored primarily as a TSDoc-annotated class while using ChainDSL-only constructs for a small number of dynamic option fields. Those cases should be covered by dedicated mixed-authoring composition tests, not by strict TSDoc ↔ ChainDSL parity tests. The assertion target for such tests is correct generated JSON Schema and UI Schema for the composed form, not identical IR from two independently authored surfaces. The composition mechanism must remain explicit; decorators are not a substitute authoring surface.

**Metadata-policy note:** Naming and label parity is evaluated after applying the same normalized metadata policy to both surfaces. A parity fixture that depends on inferred names, inferred display labels, or plural inflection must provide one shared policy object to the TSDoc path and the chain-DSL path. A test that relies on one surface's defaults without the same policy on the other is underspecified and invalid as a parity case.

**User-authored testing note:** End-to-end coverage should also demonstrate how adopters test their own systems. Those tests split into three different categories:

- data-model conformance tests: does example payload data validate against the generated JSON Schema?
- dynamic-option tests: does resolver-driven option retrieval return values compatible with the field's stored type?
- dynamic-schema tests: does resolver logic correctly transform source data into JSON Schema and JSON Forms UI schema fragments?

These are confidence tests for user integrations, not parity tests.

### Relationship to Other Documents

- **001 (Canonical IR):** Parity tests compare `FieldNode`, `ResolvedMetadata`, and `ConstraintNode` instances by structural equality on semantic fields. This document relies on 001's IR type definitions and metadata-resolution semantics.
- **002 (TSDoc Grammar):** Each shared static TSDoc tag in the tag inventory (§2) has a corresponding chain DSL option. Runtime-capable ChainDSL-only constructs are excluded from parity and instead covered by mixed-authoring composition tests.
- **003 (JSON Schema Vocabulary):** Parity at the JSON Schema output level verifies A3. The test fixtures from this document exercise the full mapping in 003 §2.
- **005 (Numeric Types):** Future extension stress-test fixtures should validate that parity holds across the extension boundary — not just for built-in types.

---

## 2. Canonical Test Fixtures

The test fixtures are a small, carefully selected set of TypeScript types that collectively exercise every parity-relevant capability. Each fixture is designed to stress a specific composition or inference behavior.

### 2.1 Fixture Design Criteria

A good parity fixture:

- Exercises at least one non-trivial IR property (constraint inheritance, subfield targeting, enum display names, alias chains)
- Uses the same metadata policy on both surfaces whenever resolved naming/label inference participates in the expected output
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
  kind: "field",
  name: "quantity",
  metadata: {
    displayName: { value: "Quantity", source: "explicit" }
  },
  type: { kind: "reference", name: "module#USDCents", typeArguments: [] },
  required: true,
  constraints: [
    { kind: "constraint", constraintKind: "minimum",   value: 0,              /* from USDCents */ },
    { kind: "constraint", constraintKind: "maximum",   value: 99999999999999, /* from Integer */ },
    { kind: "constraint", constraintKind: "multipleOf", value: 1,             /* from Integer — integer semantics */ },
    { kind: "constraint", constraintKind: "minimum",   value: 1,              /* use-site */ },
  ],
  annotations: []
}
```

### 2.3 Fixture: UserRegistration

**What it tests:** primitive text fields, boolean fields, string-literal enum fields, and all-required class-field parity.

```typescript
// TSDoc surface
class UserRegistrationForm {
  email!: string;
  username!: string;
  agreedToTerms!: boolean;
  accountType!: "personal" | "business" | "enterprise";
}
```

**Why this is a good fixture:** It pins the common required-form baseline with multiple primitive kinds and an inline enum. The fixture intentionally avoids annotations and constraints so it can isolate plain field-shape parity between class extraction and Chain DSL canonicalization.

### 2.4 Fixture: PlanStatus

**What it tests:** Required string literal union (enum) field with `@displayName` field and per-member annotations, default `enum` JSON Schema output, and a complete `x-formspec-display-names` extension.

```typescript
// TSDoc surface
class SubscriptionForm {
  /**
   * @displayName Plan Status
   * @displayName :active Active
   * @displayName :paused Paused
   * @displayName :cancelled Cancelled
   */
  status!: "active" | "paused" | "cancelled";
}
```

**Why this is a good fixture:** Per-member display names use the member-target grammar from S5. The generated JSON Schema must use flat `enum` plus a complete `x-formspec-display-names` extension by default (see 003 §2.3), while both surfaces agree that the enum field is required.

**Expected JSON Schema for `status`:**

```json
{
  "enum": ["active", "paused", "cancelled"],
  "x-formspec-display-names": {
    "active": "Active",
    "paused": "Paused",
    "cancelled": "Cancelled"
  },
  "title": "Plan Status"
}
```

```json
{
  "required": ["status"]
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

### 2.6 Fixture: ProductConfig

**What it tests:** Class-surface TSDoc extraction, required and optional field parity, and inline object-field parity between TSDoc anonymous object types and Chain DSL `field.objectWithConfig(...)`.

```typescript
// TSDoc surface
export class ProductConfigForm {
  sku!: string;
  name!: string;
  available?: boolean;
  pricing!: {
    basePrice: number;
    currency: string;
  };
}
```

```typescript
// Chain DSL surface
export const productConfigForm = formspec(
  field.text("sku", { required: true }),
  field.text("name", { required: true }),
  field.boolean("available"),
  field.objectWithConfig(
    "pricing",
    { required: true },
    field.number("basePrice", { required: true }),
    field.text("currency", { required: true })
  )
);
```

**Why this is a good fixture:** The nested `pricing` object verifies that both surfaces can produce the same inline `ObjectTypeNode` without relying on a named `$defs` reference. The mix of required and optional fields also keeps the parity fixture aligned with real product configuration forms rather than a synthetic subfield-targeting example that is not present in the current registry.

### 2.7 Coverage Note: Recursive Named Types

This is not a strict TSDoc to ChainDSL parity fixture in this revision. The current ChainDSL fixture surface does not author recursive named type definitions directly, so a synthetic parity fixture would test registry plumbing rather than equivalent author intent. Existing tests cover recursive class handling, recursive type-alias handling, generic IR emission, and CLI generation:

- `packages/build/tests/ir-analyzer.test.ts` verifies that recursive class properties resolve as named `ReferenceTypeNode` values and that the type registry contains the recursive named type.
- `packages/build/tests/ir-json-schema-generator.test.ts` verifies that a self-referential named type emits a `$defs` entry whose recursive property points back to `#/$defs/<TypeName>`.
- `packages/build/tests/defs-deduplication.test.ts` verifies a recursive `Tree` type alias whose `$defs.Tree` body remains a real object instead of a dangling self-reference.
- `e2e/tests/cli-subprocess.test.ts` uses `e2e/fixtures/cli/circular-node.ts` to verify the CLI generates recursive schemas for circular references.

---

## 3. TSDoc ↔ Chain DSL Equivalence Test Patterns

For each fixture, both the TSDoc surface and the chain DSL surface are authored, then compared. The test verifies that both produce structurally equivalent canonical IR (excluding provenance fields).

### 3.1 Fixture Layout

Parity tests currently use one consolidated `parity.test.ts` file with a fixture registry. Each fixture contributes a TSDoc source, an equivalent chain DSL source, and a hand-authored expected IR:

```
packages/build/tests/parity/

  fixtures/
    usd-cents/
      tsdoc.ts          ← TSDoc-surface TypeScript source
      chain-dsl.ts      ← Equivalent chain DSL definition
      expected-ir.ts    ← Hand-authored expected IR (no provenance)
    plan-status/
      ...
    address/
      ...
    product-config/
      ...
    user-registration/
      ...
```

The registry array in `parity.test.ts` drives the shared assertion pattern for every fixture: chain DSL → expected IR, TSDoc → expected IR, and cross-surface IR equality after provenance stripping.

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
import { field, formspec } from "@formspec/dsl";

// The chain DSL expresses constraint inheritance through type references.
// The DSL consumer names the type and the build pipeline resolves it to
// the same IR that the TSDoc extractor produces.
// Integer semantics are expressed through the named type reference —
// the "Integer" $defs entry resolves to JSON Schema type "integer".

const lineItemForm = formspec(
  field.number("unitPrice", { displayName: "Unit Price", type: "USDCents" }),
  field.number("quantity", {
    displayName: "Quantity",
    type: "USDCents",
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
class SubscriptionForm {
  /**
   * @displayName Plan Status
   * @displayName :active Active
   * @displayName :paused Paused
   * @displayName :cancelled Cancelled
   */
  status!: "active" | "paused" | "cancelled";
}
```

**Chain DSL surface (`plan-status/chain-dsl.ts`):**

```typescript
import { field, formspec } from "@formspec/dsl";

const planStatusForm = formspec(
  field.enum(
    "status",
    [
      { id: "active", label: "Active" },
      { id: "paused", label: "Paused" },
      { id: "cancelled", label: "Cancelled" },
    ] as const,
    {
      label: "Plan Status",
      required: true,
    }
  )
);

export { planStatusForm };
```

### 3.4 Address, ProductConfig, and UserRegistration: Both Surfaces

The remaining registry fixtures follow the same file layout and assertion path as `usd-cents` and `plan-status`:

- `address/` verifies named object reuse, `$defs`-style reference intent, nested string constraints, and mixed required/optional fields.
- `product-config/` verifies class extraction with primitive fields, optionality, and an inline object field whose Chain DSL equivalent uses `field.objectWithConfig(...)`.
- `user-registration/` verifies a plain required form with text, boolean, and string-literal enum fields.

Each fixture has exactly three source files:

```text
fixtures/<name>/
  tsdoc.ts
  chain-dsl.ts
  expected-ir.ts
```

The current consolidated parity suite does not use per-fixture `*.test.ts` files or hand-authored `expected-schema.json` files. JSON Schema generator behavior is tested separately from the canonical IR parity registry.

### 3.5 Test Assertion Pattern

Each parity test follows the same structure:

```typescript
for (const fixture of parityFixtures) {
  describe(`${fixture.name} parity`, () => {
    it("chain DSL produces expected IR", () => {
      const ir = canonicalizeChainDSL(fixture.chainForm);
      expect(stripProvenance(ir)).toEqual(fixture.expectedIR);
    });

    it("TSDoc produces expected IR", () => {
      const fixturePath = nodePath.join(fixturesDir, fixture.name, "tsdoc.ts");
      const ir = canonicalizeFixtureClass(fixturePath, fixture.className);
      expect(stripProvenance(ir)).toEqual(fixture.expectedIR);
    });

    it("both surfaces produce identical IR", () => {
      const chainIR = canonicalizeChainDSL(fixture.chainForm);
      const fixturePath = nodePath.join(fixturesDir, fixture.name, "tsdoc.ts");
      const tsdocIR = canonicalizeFixtureClass(fixturePath, fixture.className);

      expect(compareIR(chainIR, tsdocIR)).toEqual([]);
    });
  });
}
```

The three-test pattern is intentional:

1. **TSDoc → expected IR:** Verifies the TSDoc extractor is working correctly against a hand-written expected value. If this fails, the issue is in extraction.
2. **Chain DSL → expected IR:** Verifies the chain DSL canonicalizer is working correctly. If this fails, the issue is in canonicalization.
3. **TSDoc → chain DSL (cross-surface):** The key parity test. If (1) and (2) pass but (3) fails, there is an inconsistency in the expected IR — the two surfaces agree with each other but disagree with the hand-written expectation. This should not happen in practice but catches expected-IR maintenance errors.

---

## 4. IR Comparison Infrastructure

### 4.1 The `compareIR` Helper

The `compareIR` function compares two `FormIR` instances structurally, excluding provenance fields. It returns an empty array when the IRs are equivalent, or one `IRDifference` per divergence:

```typescript
// packages/build/tests/helpers/ir-comparison.ts

interface IRDifference {
  path: string; // JSONPath-like location, e.g. "elements[0].constraints[1].value"
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
export function compareIR(a: FormIR, b: FormIR): IRDifference[] {
  const strippedA = stripProvenance(a);
  const strippedB = stripProvenance(b);
  const differences: IRDifference[] = [];

  collectDifferences(strippedA, strippedB, "", differences);

  return differences;
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
- All resolved metadata fields: `apiName`, `displayName`, `apiNamePlural`, `displayNamePlural`, and each scalar's `source`
- All field-level fields: `name`, `metadata`, `required`, `constraints`, `annotations`
- All form-root fields: `kind`, `name`, `irVersion`, `elements`, `metadata`, `rootAnnotations`, `typeRegistry`, `annotations`

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

**FieldNode:** `kind`, `name`, `metadata`, `required`, `constraints` (order-normalized), `annotations` (order-normalized), `type` (structural)

**ConstraintNode:** `kind`, `constraintKind`, `value` (for numeric constraints, compared with tolerance-free exact equality — see §4.5), `pattern` (for pattern constraints), `bound`, `extensionId` (for custom constraints)

**AnnotationNode:** `kind`, `annotationKind`, `value`

**ResolvedMetadata:** `apiName`, `displayName`, `apiNamePlural`, `displayNamePlural`, with each scalar compared by `value` and `source`

**TypeNode:** `kind`, `primitiveKind` (primitives), `members` (enum/union — order-sensitive), `properties` (objects — order-preserved per D3), `items` (arrays), `name` + `typeArguments` (references), `typeId` + `payload` (custom)

**FormIR root:** `kind`, `name`, `irVersion`, `elements` (order-sensitive), `metadata`, `rootAnnotations`, `typeRegistry` (key-sorted for determinism, per D3), `annotations`

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
// generator parity assertion sketch
import { generateJsonSchemaFromIR } from "@formspec/build/internals";

describe("A3 generator parity", () => {
  it("both surfaces produce identical JSON Schema from equivalent IR", () => {
    const chainIR = canonicalizeChainDSL(fixture.chainForm);
    const tsdocIR = canonicalizeFixtureClass(fixturePath, fixture.className);

    const tsdocSchema = generateJsonSchemaFromIR(tsdocIR);
    const chainSchema = generateJsonSchemaFromIR(chainIR);

    // A3: same IR → same output (exact structural equality)
    expect(tsdocSchema).toEqual(chainSchema);
  });

  it("generator is pure: same IR produces same output on repeated calls", () => {
    const ir = canonicalizeChainDSL(fixture.chainForm);

    const output1 = generateJsonSchemaFromIR(ir);
    const output2 = generateJsonSchemaFromIR(ir);
    const output3 = generateJsonSchemaFromIR(ir);

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
it("serialized output is deterministic across runs", () => {
  const ir1 = canonicalizeChainDSL(fixture.chainForm);
  const ir2 = canonicalizeChainDSL(fixture.chainForm);

  const json1 = JSON.stringify(generateJsonSchemaFromIR(ir1));
  const json2 = JSON.stringify(generateJsonSchemaFromIR(ir2));

  expect(json1).toBe(json2); // string equality, not deep equality
});
```

### 5.3 Output Comparison Against Hand-Authored Expected Schemas

The current consolidated parity registry uses hand-authored `expected-ir.ts` files as the normative fixture expectations. It does not currently include `expected-schema.json` files under `packages/build/tests/parity/fixtures`.

When a parity fixture grows a hand-authored schema expectation, that schema file should be reviewed as observable output contract. Until then, JSON Schema output checks should derive from equivalent canonical IR and generator-specific assertions rather than from nonexistent fixture files.

---

## 6. Extensibility Stress-Test Fixtures

Extension parity is planned but not part of the current consolidated registry in `packages/build/tests/parity/parity.test.ts`. The live registry currently covers only:

- `address`
- `user-registration`
- `product-config`
- `plan-status`
- `usd-cents`

Future extension fixtures should use the same `tsdoc.ts`, `chain-dsl.ts`, and `expected-ir.ts` shape as the current registry. Candidate extension fixtures include:

- `decimal` for extension type registration, decimal-preserving numeric constraints, and custom vocabulary keywords such as `x-myorg-maxSigFig`
- `date-only` for non-numeric extension types, date-bound constraints, and `format: "date"` schema output

When those fixtures are added, they should be registered in `parity.test.ts` and accompanied by real fixture files before this document describes them as active coverage.

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
// packages/build/tests/parity/diagnostics.test.ts

import { describe, it, expect } from "vitest";
import { extractWithDiagnostics } from "@formspec/build/internals";
import { canonicalizeWithDiagnostics } from "@formspec/build/internals";
import { compareDiagnostics } from "../helpers/diagnostic-comparison";

describe("diagnostic parity: constraint broadening", () => {
  it("inverted numeric bounds", async () => {
    // TSDoc: @minimum 10 @maximum 5 on the same number field
    const tsdocDiagnostics = await extractWithDiagnostics(
      "./fixtures/diagnostics/inverted-bounds-tsdoc.ts"
    );

    // Chain DSL: field.number("x", { minimum: 10, maximum: 5 })
    const chainDiagnostics = canonicalizeWithDiagnostics(invertedBoundsDSLForm);

    expect(compareDiagnostics(tsdocDiagnostics, chainDiagnostics)).toEqual({
      equivalent: true,
      differences: [],
    });
  });
});
```

### 7.3 Diagnostic Comparison Helper

```typescript
// packages/build/tests/helpers/diagnostic-comparison.ts

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
| Extension-specific contradiction | `@maxSigFig 12` on `Decimal8` (inherits `@maxSigFig 8`)    | `CONSTRAINT_BROADENING`    | Planned       |
| Missing required display names   | Enum with member display names on some but not all members | `INCOMPLETE_DISPLAY_NAMES` | Yes           |

---

## 8. Test Organization

### 8.1 File Naming Conventions

| Test file pattern                              | Purpose                                  |
| ---------------------------------------------- | ---------------------------------------- |
| `tests/parity/*.test.ts`                       | Surface parity tests (TSDoc ↔ chain DSL) |
| `tests/parity/fixtures/*/tsdoc.ts`             | TSDoc surface fixture                    |
| `tests/parity/fixtures/*/chain-dsl.ts`         | Chain DSL surface fixture                |
| `tests/parity/fixtures/*/expected-ir.ts`       | Hand-authored expected IR                |
| `tests/parity/fixtures/*/expected-schema.json` | Hand-authored expected JSON Schema       |
| `tests/parity/diagnostics.test.ts`             | Diagnostic consistency across surfaces   |
| `tests/parity/a3-purity.test.ts`               | Generator purity (A3)                    |
| `tests/helpers/ir-comparison.ts`               | `compareIR` helper                       |
| `tests/helpers/diagnostic-comparison.ts`       | `compareDiagnostics` helper              |

### 8.2 Location in the Monorepo

Parity tests live in `@formspec/build` because:

1. The build package owns both the TSDoc extractor and the JSON Schema generator — the full pipeline from source to output.
2. The chain DSL canonicalizer is part of `@formspec/build` (it canonicalizes `FormSpec<Elements>` to the canonical IR).
3. Testing parity requires invoking the TypeScript compiler API (for TSDoc extraction), which is a dependency of `@formspec/build` and not available in lighter packages.

Extension fixture tests (`Decimal`, `DateOnly`) are in `@formspec/build`'s test suite but depend on extension packages defined in the monorepo's test fixtures directory:

```
packages/build/tests/
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
pnpm --filter @formspec/build exec vitest run tests/parity

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

Future extension parity fixtures should run in this same job once they are added to the real fixture registry.

### 8.5 Maintenance Obligations

When adding a new TSDoc tag or chain DSL option:

1. Add the tag/option to the appropriate canonical fixture (or create a new fixture if it tests a new concern)
2. Update `expected-ir.ts` for all affected fixtures, plus `expected-schema.json` only for fixtures that explicitly add hand-authored schema checks
3. Add or update the corresponding parity test assertions
4. If the new tag has an error path, add a diagnostic consistency test case (§7.4)

The `expected-ir.ts` files are the current parity fixture specification. Any future `expected-schema.json` files will be output-contract fixtures too, and changes to those files must be reviewed carefully.

---

## Appendix: Open Decisions Summary

| #    | Section  | Question                                                                                                                                           | Status                                                                                                                                                                                                                                                                                                                                           |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OD-1 | §3.2     | How does the chain DSL express type alias constraint inheritance — by name reference resolved at build time, or by explicit constraint repetition? | By name reference — `type: "USDCents"` loads the alias chain from the project's type registry                                                                                                                                                                                                                                                    |
| OD-2 | §4.3     | Should snapshot tests be part of parity validation?                                                                                                | **DECIDED:** No — snapshots are not part of the normative parity strategy; parity uses hand-authored expectations and structural assertions only                                                                                                                                                                                                 |
| OD-3 | §6, §8.2 | Should extension fixture packages (`@formspec/test-fixtures`) be in `packages/` or alongside the tests?                                            | **DECIDED:** In `packages/test-fixtures/` as a private, unpublished workspace package. This allows the fixture extensions to have their own `package.json`, `tsconfig.json`, and build step, while remaining clearly separated from distributable code. Tests in `packages/build/tests/` reference the fixture package via workspace dependency. |
| OD-4 | §7.1     | Should diagnostic message text be compared character-for-character, or only code + severity?                                                       | Code + severity in parity comparison; message text is verified separately against expected values                                                                                                                                                                                                                                                |
