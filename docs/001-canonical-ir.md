# 001 — Canonical IR & Constraint System

> **Status:** Draft
> **Depends on:** [000-principles.md](./000-principles.md)
> **Covers:** Strategic workstreams A (Canonical IR) and B (Constraint System)

---

## 1. Overview

This document specifies the Canonical Intermediate Representation (IR) for FormSpec and the constraint system that attaches to it. These two workstreams are specified together because the IR cannot be designed without knowing how constraints compose, and the constraint model is only meaningful in the context of IR nodes it annotates.

### Why a Canonical IR?

The current codebase has two independent generation paths:

- The **chain DSL path** walks `FormSpec<Elements>` directly in `generateJsonSchema` and `generateUiSchema`, treating `FormElement` as the final representation.
- The **TSDoc-annotated type path** (currently tied to the decorator DSL being removed per NP1) walks `FieldInfo[]` produced by the TypeScript static analyzer and applies constraints through `applyDecoratorsToSchema`.

Both paths produce `JSONSchema7` and `UISchema` objects, but they do so independently, with no shared intermediate structure. This means:

- The same constraint logic is duplicated across `applyDecoratorsToSchema` (decorator path) and `fieldToJsonSchema` (chain DSL path).
- There is no single place to run contradiction detection, validate constraint composition, or attach provenance.
- "Two surfaces, one semantic model" (PP5) is an aspiration, not yet an architectural reality.

The Canonical IR closes this gap. Both surfaces compile to the IR; all downstream operations — JSON Schema generation (003), UI Schema generation, constraint validation, diagnostics (004) — consume the IR exclusively (A1, A5).

### Principles Satisfied

| Section                    | Principles             |
| -------------------------- | ---------------------- |
| Type node taxonomy         | PP2, PP3, PP7, S7, A4  |
| Constraint node model      | S1, S2, S4, C1, E1, E2 |
| Annotation node model      | C1, S6, A4             |
| Provenance model           | S3, D2                 |
| Path-target model          | S5                     |
| Merge/refinement semantics | S1, PP3, C1            |
| Contradiction detection    | S2, D1, D4             |
| Extension registration     | E1, E3, E4, E5         |
| Migration mapping          | A1, A5, NP1            |

---

## 2. Type Node Taxonomy

The IR represents every field in a form as a `TypeNode` — a discriminated union describing the field's data type. Type nodes are **semantic descriptions**, not TypeScript AST nodes and not JSON Schema fragments (A4). They are serializable plain objects (A2).

### 2.1 The `TypeNode` Discriminated Union

```typescript
type TypeNode =
  | PrimitiveTypeNode
  | EnumTypeNode
  | ArrayTypeNode
  | ObjectTypeNode
  | UnionTypeNode
  | ReferenceTypeNode
  | DynamicTypeNode
  | CustomTypeNode;
```

### 2.2 Primitive Types

Primitives map directly to JSON Schema primitive types.

```typescript
interface PrimitiveTypeNode {
  readonly kind: 'primitive';
  readonly primitiveKind: 'string' | 'number' | 'boolean' | 'null';
}
```

**Design note:** The IR has no special `integer` primitive kind. Integer semantics are expressed via a `MultipleOfConstraint` with `value: 1` on a `number` type node. The JSON Schema generator detects this pattern and promotes `"type": "number"` to `"type": "integer"` in output (see 005). This keeps the IR model minimal — there is no footgun from a redundant integer kind that diverges from the constraint representation.

### 2.3 Enum Types

Static enums are those whose members are known at build time — string literal unions, `as const` arrays, TypeScript `enum` declarations, and `const enum` declarations (S7).

```typescript
interface EnumMember {
  /** The serialized value stored in data. */
  readonly value: string | number;
  /**
   * Optional per-member display name.
   * Populated when the source author annotated individual members via
   * the path-target grammar (S5): `@displayName :draft Draft`.
   */
  readonly displayName?: string;
}

interface EnumTypeNode {
  readonly kind: 'enum';
  readonly members: readonly EnumMember[];
}
```

**Design note:** Enum member identity is the `value`. Display names on members are stored here rather than as annotations on the parent field because they are intrinsic to the member — a union member's label is part of what that member _is_, not a presentation preference on the containing field.

### 2.4 Array Types

```typescript
interface ArrayTypeNode {
  readonly kind: 'array';
  readonly items: TypeNode;
}
```

Array-level constraints (`minItems`, `maxItems`) attach to the `FieldNode` that holds this type, not to the type itself — a type is reusable, but cardinality constraints are applied at the point of use (S8).

### 2.5 Object Types

```typescript
interface ObjectTypeNode {
  readonly kind: 'object';
  /**
   * Named properties of this object. Order is preserved from the source
   * declaration (for deterministic D3 output).
   */
  readonly properties: readonly ObjectProperty[];
  /**
   * Whether additional properties beyond those listed are permitted.
   * Defaults to false — object types in FormSpec are closed.
   */
  readonly additionalProperties: boolean;
}

interface ObjectProperty {
  readonly name: string;
  readonly type: TypeNode;
  readonly optional: boolean;
  /**
   * Constraints attached to this property within this object context.
   * Distinct from constraints on the property's type — these are
   * use-site constraints (e.g., `@minimum :amount 0` targets the
   * `amount` property of a `MonetaryAmount` field).
   */
  readonly constraints: readonly ConstraintNode[];
  readonly annotations: readonly AnnotationNode[];
  readonly provenance: Provenance;
}
```

### 2.6 Union Types

Union types that are not all-string-literal or all-number-literal enums (those are `EnumTypeNode`) become `UnionTypeNode`.

```typescript
interface UnionTypeNode {
  readonly kind: 'union';
  readonly members: readonly TypeNode[];
}
```

Nullable types (`T | null`) are represented as `UnionTypeNode` with a `PrimitiveTypeNode` (`null`) member — there is no special nullable wrapper. This keeps the model uniform and mirrors JSON Schema's `oneOf` representation (PP6).

### 2.7 Reference Types

Named types that appear as references in the source are preserved as references in the IR (PP7). Inlining them would erase the distinction between a reusable named type and an inline structural type.

```typescript
interface ReferenceTypeNode {
  readonly kind: 'reference';
  /**
   * The fully-qualified name of the referenced type.
   * For TypeScript interfaces/type aliases: `"<module>#<TypeName>"`.
   * For built-in types: the primitive kind string.
   */
  readonly name: string;
  /**
   * Type arguments if this is a generic instantiation.
   * e.g., `Array<string>` → `{ name: "Array", typeArguments: [PrimitiveTypeNode("string")] }`
   */
  readonly typeArguments: readonly TypeNode[];
}
```

The IR registry (section 9) maintains a `TypeDefinition` map from reference names to their resolved `TypeNode`. Generators walk this map to emit `$defs` in JSON Schema (PP7).

**OPEN DECISION:** Should circular references be represented with a `ReferenceTypeNode` pointing back to an entry in the registry (idiomatic for recursive types like `TreeNode`), or should the IR forbid circular type graphs entirely? The current implementation detects cycles and emits `{ type: "object" }` as a fallback. The principled approach is reference-based — this enables correct `$ref` emission per PP7 — but requires the registry to be constructed before cycle resolution.

### 2.8 Dynamic Types

Dynamic fields have no static type — their schema is resolved at runtime from a named data source.

```typescript
interface DynamicTypeNode {
  readonly kind: 'dynamic';
  readonly dynamicKind: 'enum' | 'schema';
  /**
   * Key identifying the runtime data source or schema provider.
   */
  readonly sourceKey: string;
  /**
   * For dynamic enums: field names whose current values are passed as
   * parameters to the data source resolver.
   */
  readonly parameterFields: readonly string[];
}
```

### 2.9 Custom Types

Custom types registered by extensions (E1, E5) that do not map to any built-in kind.

```typescript
interface CustomTypeNode {
  readonly kind: 'custom';
  /**
   * The extension-qualified type identifier.
   * Format: `"<vendor-prefix>/<extension-name>/<type-name>"`
   * e.g., `"x-stripe/monetary/MonetaryAmount"`
   */
  readonly typeId: string;
  /**
   * Opaque payload serialized by the extension that registered this type.
   * Must be JSON-serializable (A2).
   */
  readonly payload: JsonValue;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
```

---

## 3. Constraint Node Model

Constraints are set-influencing metadata (C1): they narrow the set of valid values for a field. Every constraint in the IR is represented as a `ConstraintNode`.

### 3.1 The `ConstraintNode` Union

```typescript
type ConstraintNode =
  | NumericConstraintNode
  | LengthConstraintNode
  | PatternConstraintNode
  | ArrayCardinalityConstraintNode
  | EnumMemberConstraintNode
  | CustomConstraintNode;
```

### 3.2 Numeric Constraints

Apply to `number` fields (including those that express integer semantics via `multipleOf: 1`). `minimum` and `maximum` are inclusive; `exclusiveMinimum` and `exclusiveMaximum` are exclusive bounds (matching JSON Schema 2020-12 semantics, PP6).

```typescript
interface NumericConstraintNode {
  readonly kind: 'constraint';
  readonly constraintKind:
    | 'minimum'
    | 'maximum'
    | 'exclusiveMinimum'
    | 'exclusiveMaximum'
    | 'multipleOf';
  readonly value: number;
  readonly provenance: Provenance;
}
```

**Type applicability (S4):** `NumericConstraintNode` may only attach to fields with `PrimitiveTypeNode("number")` or a `ReferenceTypeNode` that resolves to one. Attaching to any other type is a static error.

### 3.3 Length Constraints

Apply to `string` fields and `array` fields. `minLength`/`maxLength` apply to strings; `minItems`/`maxItems` apply to arrays. They share the same node shape because the composition rules are identical (S5, PP3).

```typescript
interface LengthConstraintNode {
  readonly kind: 'constraint';
  readonly constraintKind: 'minLength' | 'maxLength' | 'minItems' | 'maxItems';
  readonly value: number;
  readonly provenance: Provenance;
}
```

**Type applicability (S4):** `minLength`/`maxLength` require `PrimitiveTypeNode("string")`; `minItems`/`maxItems` require `ArrayTypeNode`.

### 3.4 Pattern Constraints

Apply to `string` fields only. Multiple `pattern` constraints on the same field compose via intersection (C1): all patterns must match simultaneously.

```typescript
interface PatternConstraintNode {
  readonly kind: 'constraint';
  readonly constraintKind: 'pattern';
  /** ECMA-262 regular expression, without delimiters. */
  readonly pattern: string;
  readonly provenance: Provenance;
}
```

**OPEN DECISION:** Should the IR support the JSON Schema 2020-12 `patternProperties` keyword for object fields, or only `pattern` for strings? If `patternProperties` is in scope, it should live here as a `PatternConstraintNode` variant, not as a structural concern on `ObjectTypeNode`.

### 3.5 Array Cardinality Constraints

These are split from `LengthConstraintNode` above only if array cardinality needs different semantics (e.g., `uniqueItems`). The current model folds them into `LengthConstraintNode` for uniformity.

```typescript
interface ArrayCardinalityConstraintNode {
  readonly kind: 'constraint';
  readonly constraintKind: 'uniqueItems';
  readonly value: true;
  readonly provenance: Provenance;
}
```

### 3.6 Enum Member Constraints

Allow restricting a field typed as a broader enum to a subset of its members at the point of use. This is a refinement (S1) — the allowed members can only be narrowed, never broadened.

```typescript
interface EnumMemberConstraintNode {
  readonly kind: 'constraint';
  readonly constraintKind: 'allowedMembers';
  readonly members: readonly (string | number)[];
  readonly provenance: Provenance;
}
```

### 3.7 Custom Constraints

Extensions register custom constraints that carry an opaque payload. The `compositionRule` declaration fulfills E2 — the system cannot guess the composition rule.

```typescript
interface CustomConstraintNode {
  readonly kind: 'constraint';
  readonly constraintKind: 'custom';
  /**
   * Extension-qualified constraint identifier.
   * Format: `"<vendor-prefix>/<extension-name>/<constraint-name>"`
   */
  readonly constraintId: string;
  /**
   * JSON-serializable payload defined by the extension.
   */
  readonly payload: JsonValue;
  /**
   * How this constraint composes with others of the same `constraintId`.
   * Must be declared by the extension (E2).
   *
   * "intersect" — the effective constraint is the intersection of all instances.
   *   Suitable for constraints that narrow a set (like minimum/maximum).
   * "override" — the most-specific instance wins (closest to point of use).
   *   Suitable for constraints that produce a single value (like a format hint).
   */
  readonly compositionRule: 'intersect' | 'override';
  readonly provenance: Provenance;
}
```

### 3.8 Constraint Composition Rules

Per C1, constraints are set-influencing and compose via intersection. The practical meaning for each built-in kind:

| Constraint Kind    | Composition Rule                                     | Example                                                       |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------- |
| `minimum`          | Take the max of all values (tightest lower bound)    | `@minimum 0` + `@minimum 5` → effective minimum is `5`        |
| `maximum`          | Take the min of all values (tightest upper bound)    | `@maximum 100` + `@maximum 50` → effective maximum is `50`    |
| `exclusiveMinimum` | Take the max of all values                           | Same as `minimum`                                             |
| `exclusiveMaximum` | Take the min of all values                           | Same as `maximum`                                             |
| `multipleOf`       | LCM of all values (values valid for all constraints) | `@multipleOf 4` + `@multipleOf 6` → effective `multipleOf 12` |
| `minLength`        | Take the max (tightest lower bound)                  |                                                               |
| `maxLength`        | Take the min (tightest upper bound)                  |                                                               |
| `minItems`         | Take the max                                         |                                                               |
| `maxItems`         | Take the min                                         |                                                               |
| `pattern`          | All patterns must match (implicit `allOf`)           |                                                               |
| `allowedMembers`   | Set intersection                                     |                                                               |

**Intersection never broadens (S1):** Adding a constraint can only make the valid set smaller or equal. The merge algorithm (section 7) enforces this invariant.

---

## 4. Annotation Node Model

Annotations are value-influencing metadata (C1): they carry a single scalar that describes or presents the field but does not affect which values are valid. Examples include display names, descriptions, placeholder text, default values, and UI hints.

### 4.1 The `AnnotationNode` Union

```typescript
type AnnotationNode =
  | DisplayNameAnnotationNode
  | DescriptionAnnotationNode
  | PlaceholderAnnotationNode
  | DefaultValueAnnotationNode
  | DeprecatedAnnotationNode
  | FormatHintAnnotationNode
  | CustomAnnotationNode;
```

### 4.2 Built-in Annotations

```typescript
interface DisplayNameAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'displayName';
  readonly value: string;
  readonly provenance: Provenance;
}

interface DescriptionAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'description';
  readonly value: string;
  readonly provenance: Provenance;
}

interface PlaceholderAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'placeholder';
  readonly value: string;
  readonly provenance: Provenance;
}

interface DefaultValueAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'defaultValue';
  /**
   * The default value. Must be JSON-serializable and compatible with
   * the field's type. Type compatibility is verified during the Validate
   * phase (A5), not during canonicalization.
   */
  readonly value: JsonValue;
  readonly provenance: Provenance;
}

interface DeprecatedAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'deprecated';
  /** Optional deprecation message, sourced from `@deprecated <message>`. */
  readonly message?: string;
  readonly provenance: Provenance;
}

/**
 * A hint to the UI renderer about how to display this field.
 * This does not affect schema validation (B5).
 */
interface FormatHintAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'formatHint';
  /**
   * Renderer-specific format identifier.
   * Examples: "textarea", "radio", "date", "color".
   */
  readonly format: string;
  readonly provenance: Provenance;
}
```

**Ecosystem tag alignment (S6):** `displayName` derives from `@displayName` (following TSDoc conventions), `description` from `@description`, `defaultValue` from `@defaultValue`, `deprecated` from `@deprecated`. These are standard tags that editors already understand.

### 4.3 Custom Annotations

```typescript
interface CustomAnnotationNode {
  readonly kind: 'annotation';
  readonly annotationKind: 'custom';
  /**
   * Extension-qualified annotation identifier.
   * Format: `"<vendor-prefix>/<extension-name>/<annotation-name>"`
   */
  readonly annotationId: string;
  readonly value: JsonValue;
  readonly provenance: Provenance;
}
```

### 4.4 Annotation Composition (Override Semantics)

Annotations compose via override: the annotation closest to the point of use wins (C1). The precedence order from highest to lowest:

1. **Field-level annotation** — directly on the field declaration
2. **Type-alias-level annotation** — on the named type the field references
3. **Base-type annotation** — on a type the named type extends or is derived from

This matches TypeScript developers' intuition: a field's own label overrides whatever the type definition suggests (PP3).

The merge algorithm (section 7) implements this by tracking the `specificity` level in `Provenance` and selecting the highest-specificity annotation when multiple annotations of the same `annotationKind` are present.

---

## 5. Provenance Model

Every constraint and annotation node carries a `Provenance` record describing its origin (S3). This enables diagnostics that point to the source of a contradiction, not just its detection site (D2).

### 5.1 The `Provenance` Type

```typescript
interface Provenance {
  /**
   * The authoring surface that produced this constraint or annotation.
   * Used to display meaningful diagnostic context and for surface-specific
   * filtering (e.g., "this error came from a TSDoc tag on line 42").
   */
  readonly surface: 'tsdoc' | 'chain-dsl' | 'extension' | 'inferred';
  /**
   * Absolute path to the source file.
   */
  readonly file: string;
  /**
   * 1-based line number in the source file.
   */
  readonly line: number;
  /**
   * 0-based column number in the source file.
   */
  readonly column: number;
  /**
   * Optional: length of the source span in characters (for IDE underline ranges).
   */
  readonly length?: number;
  /**
   * The specific tag, call, or construct that produced this node.
   * Examples:
   *   surface="tsdoc"     → tagName: "@minimum"
   *   surface="chain-dsl" → tagName: "field.number({ min: 0 })"
   *   surface="inferred"  → tagName: "optional" (from ? modifier)
   */
  readonly tagName?: string;
}
```

**The `inferred` surface** covers metadata that FormSpec derives without the author writing an explicit tag — for example, optionality inferred from a `?` modifier, or enum members inferred from a string literal union type. These are still tracked with provenance so diagnostics can point to the declaration site rather than producing opaque errors.

### 5.2 Provenance in Diagnostics

When the contradiction detection algorithm (section 8) detects a contradiction between two constraints, the resulting diagnostic carries both provenance records:

```typescript
interface ContradictionDiagnostic {
  readonly code: string; // e.g., "CONTRADICTION" (prefixed per PP10)
  readonly message: string; // Human-readable, actionable (D4)
  readonly severity: 'error'; // Contradictions are always errors (S2)
  readonly primaryLocation: Provenance; // The constraint causing the contradiction
  readonly relatedLocations: readonly Provenance[]; // Prior constraints it conflicts with
}
```

This satisfies D2 (source-located), D1 (structured), and D4 (actionable).

---

## 6. Path-Target Model

The path-target model enables a single constraint tag to target a nested field of a complex type, rather than requiring a proliferation of specialized tags (S5).

### 6.1 Motivation

Consider a field typed as `MonetaryAmount`:

```typescript
type MonetaryAmount = { value: number; currency: string };

/** @minimum :value 0 */
discount: MonetaryAmount;
```

The `@minimum` tag applies to the `value` sub-field of `discount`, not to `discount` itself. Without path targeting, the author would need either: (a) a separate tag like `@minimumValue`, proliferating the tag vocabulary, or (b) an annotation on the `MonetaryAmount` type definition that applies globally rather than at the use site.

### 6.2 `PathTarget` in Constraint Nodes

Every constraint node has an optional `path` field specifying the sub-field target:

```typescript
interface PathTarget {
  /**
   * Sequence of property names forming a path from the annotated field's type
   * to the target sub-field.
   *
   * Examples:
   *   `["value"]`           — targets the `value` property
   *   `["address", "zip"]`  — targets `address.zip` (nested two levels)
   */
  readonly segments: readonly string[];
}
```

The built-in constraint nodes are extended:

```typescript
interface NumericConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "minimum" | /* ... */;
  readonly value: number;
  /**
   * If present, this constraint targets the field at the given path within
   * the annotated field's type, not the field itself.
   */
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}
```

The `path` field is available on all constraint kinds — it is not specific to numeric constraints (S5, PP8).

### 6.3 Path Targeting for Annotations

The same grammar applies to annotations. The per-member `@displayName` syntax in the principles document is a specific form of path targeting for union members:

```typescript
/**
 * @displayName :sync Synchronous
 * @displayName :async Asynchronous
 */
mode: 'sync' | 'async';
```

Here, `:sync` is syntactic sugar for targeting the `sync` member of the union. In the IR, these become `DisplayNameAnnotationNode` entries on the individual `EnumMember` records within the `EnumTypeNode`, not annotations on the parent field. The canonicalization phase (A5) resolves the path-target syntax into the correct IR placement.

### 6.4 Path Validation

During the Validate phase (A5), path targets are checked against the resolved type:

- If the target path does not exist in the type, it is a static error (D1, D4).
- If the target path leads to a type that does not accept the constraint kind (S4), it is a static error.
- Paths into `DynamicTypeNode` fields cannot be validated statically and produce a warning.

---

## 7. Merge and Refinement Semantics

When a field's type is derived from another type (by referencing a named type, by extending a type, or by composing types), constraints and annotations from the source type are inherited. The merge rules govern how inherited and use-site metadata combine.

### 7.1 The Merge Model

Merging happens during the **Canonicalize** phase (A5). The Canonicalize phase takes raw constraint and annotation sets from multiple sources and produces a single resolved `FieldNode` with merged results.

Sources, in ascending specificity order:

1. **Base type constraints/annotations** — declared on a type that the field's type derives from
2. **Type-alias constraints/annotations** — declared on the named type itself
3. **Field-level constraints/annotations** — declared directly on the field

### 7.2 Constraint Merge (Intersection)

All constraints at every specificity level are accumulated and composed via intersection (C1, S1). The effective value for each `constraintKind` is computed according to the table in section 3.8.

```
effective(minimum) = max(base.minimum, alias.minimum, field.minimum)
effective(maximum) = min(base.maximum, alias.maximum, field.maximum)
effective(pattern) = { all patterns must match simultaneously }
```

This is directly analogous to TypeScript intersection types (PP3): `type A = { x: string } & { x: "foo" | "bar" }` narrows `x` to `"foo" | "bar"` — the intersection is tighter. Adding a constraint never broadens (S1).

### 7.3 Annotation Merge (Override)

For each `annotationKind`, only the annotation with the highest specificity is retained (C1). If a field has both a type-alias-level `displayName` and a field-level `displayName`, the field-level value wins.

This mirrors how TypeScript class members override base class members (PP3): the most-derived declaration takes precedence.

### 7.4 Provenance Through Merging

After merging, the provenance of each surviving constraint or annotation node is preserved as-is from its source. If a `minimum` constraint from a type alias survives (because no field-level `minimum` exists), its `Provenance` still points to the type alias declaration. This is essential for diagnostics (D2): if a contradiction involves an inherited constraint, the error points to where the constraint was authored.

The resolved `FieldNode` additionally carries a `mergeHistory` field (debug/tooling use only, not used by generators):

```typescript
interface FieldNode {
  // ... (see section below)
  /**
   * Ordered list of constraint nodes that participated in the merge,
   * including those that were dominated. Used for diagnostic tooling
   * to explain why a particular effective constraint value was reached.
   * Not consumed by schema generators.
   */
  readonly mergeHistory?: readonly {
    readonly node: ConstraintNode | AnnotationNode;
    readonly dominated: boolean;
  }[];
}
```

---

## 8. Contradiction Detection Algorithm

A contradiction occurs when the set of constraints on a field becomes unsatisfiable — no value can satisfy all constraints simultaneously. The system detects these at build time (S2) during the Validate phase (A5).

### 8.1 Decidable Combinations

For all built-in constraint combinations, contradiction detection is decidable:

| Pattern                                     | Contradiction Condition                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `minimum M` + `maximum N`                   | `M > N`                                                              |
| `exclusiveMinimum M` + `maximum N`          | `M >= N`                                                             |
| `minimum M` + `exclusiveMaximum N`          | `M >= N`                                                             |
| `exclusiveMinimum M` + `exclusiveMaximum N` | `M >= N`                                                             |
| `minLength M` + `maxLength N`               | `M > N`                                                              |
| `minItems M` + `maxItems N`                 | `M > N`                                                              |
| `allowedMembers [A]` + `allowedMembers [B]` | `A ∩ B = ∅` (empty intersection)                                     |
| `pattern P1` + `pattern P2`                 | Undecidable in general — treated as non-contradictory (conservative) |

Contradictions involving `pattern` constraints are undecidable in the general case (no algorithm can determine satisfiability of the intersection of two arbitrary regular expressions). The system reports no contradiction for pattern combinations — it trusts the author. This is the only built-in combination that is not decidable (S2: "for all built-in constraint _combinations_" — pattern intersection is flagged as undecidable in the spec).

### 8.2 Algorithm Sketch

```
for each FieldNode in the IR:
  constraints = FieldNode.constraints (after merging, section 7)

  // Numeric bounds check
  effective_min  = max of all minimum/exclusiveMinimum values (treat exclusive as min + ε)
  effective_max  = min of all maximum/exclusiveMaximum values (treat exclusive as max - ε)
  if effective_min > effective_max:
    emit CONTRADICTION diagnostic with provenance from both sides

  // Length bounds check
  effective_minLength = max of all minLength values
  effective_maxLength = min of all maxLength values
  if effective_minLength > effective_maxLength:
    emit CONTRADICTION diagnostic

  // Array cardinality check (same structure as length)

  // Enum member intersection
  allowed_sets = all allowedMembers constraints
  if len(allowed_sets) > 1:
    intersection = allowed_sets[0] ∩ allowed_sets[1] ∩ ...
    if intersection = ∅:
      emit CONTRADICTION diagnostic
```

### 8.3 Type Applicability Errors

Before contradiction checking, the Validate phase checks that each constraint is applicable to the field's type (S4). A `minLength` constraint on a `number` field is reported as `TYPE_MISMATCH`, not `CONTRADICTION` — they are distinct error kinds with distinct messages (D4).

```typescript
type DiagnosticCode =
  | 'CONTRADICTION'
  | 'TYPE_MISMATCH' // Constraint applied to wrong type
  | 'UNKNOWN_PATH_TARGET' // Path target does not exist in type
  | 'INVALID_PATH_TARGET' // Path target type does not accept this constraint
  | 'MISSING_REQUIRED' // Field that appears in a condition does not exist
  | string; // Extension-defined codes
```

All codes are prefixed with a configurable vendor token at emit time (D1, PP10). The codes above are the undecorated forms; at output they become `FORMSPEC_CONTRADICTION` by default, or `STRIPE_CONTRADICTION` if the vendor token is configured to `STRIPE`.

### 8.4 Custom Constraint Contradiction Checking

Extensions may opt into decidable contradiction checking by implementing the `ContradictionChecker` interface (E2). If no checker is provided, the system treats multiple instances of the same `constraintId` as non-contradictory and applies the declared `compositionRule` without validation.

```typescript
interface ContradictionChecker {
  /**
   * Given a list of constraint nodes of this extension's type,
   * returns a list of contradiction diagnostics (empty if none).
   */
  check(constraints: readonly CustomConstraintNode[]): readonly ContradictionDiagnostic[];
}
```

---

## 9. Extension Registration Interfaces

Extensions are npm packages (E5) identified by `"formspec-extension"` in their `package.json` keywords. At initialization, FormSpec scans installed dependencies for this keyword and loads each extension's registration module.

Built-in types, constraints, and annotations use the same registration interfaces (E1). There is no privileged internal API.

### 9.1 The `ExtensionModule` Interface

```typescript
/**
 * The shape that every FormSpec extension module must export as its
 * default export (or named `formspecExtension` export).
 */
interface ExtensionModule {
  /**
   * Unique identifier for this extension.
   * Format: `"<vendor-prefix>/<extension-name>"`
   * e.g., `"x-stripe/monetary"`
   */
  readonly extensionId: string;

  /**
   * Custom type registrations. Each entry teaches the canonicalizer how
   * to recognize and represent a TypeScript type as a CustomTypeNode.
   */
  readonly types?: readonly CustomTypeRegistration[];

  /**
   * Custom constraint registrations.
   */
  readonly constraints?: readonly CustomConstraintRegistration[];

  /**
   * Custom annotation registrations.
   */
  readonly annotations?: readonly CustomAnnotationRegistration[];

  /**
   * Custom JSON Schema keyword registrations.
   * These are emitted as extension keywords in the generated JSON Schema
   * under the configured vendor prefix (E3).
   */
  readonly vocabularyKeywords?: readonly VocabularyKeywordRegistration[];

  /**
   * Optional contradiction checker for the extension's custom constraints.
   * If omitted, no contradiction checking is performed for this extension's
   * constraints (E2 — the extension must declare the composition rule, but
   * need not implement decidable checking).
   */
  readonly contradictionChecker?: ContradictionChecker;
}
```

### 9.2 Custom Type Registration

```typescript
interface CustomTypeRegistration {
  /**
   * The TypeScript type name this registration handles.
   * May be a fully-qualified name `"@scope/package#TypeName"` or a
   * bare name `"TypeName"` that matches any type by that name.
   */
  readonly typeName: string;

  /**
   * Called by the canonicalizer when it encounters a type matching
   * `typeName`. Returns a `CustomTypeNode` payload, or null to
   * decline (allowing other extensions to handle the type).
   */
  recognize(context: TypeRecognitionContext): JsonValue | null;

  /**
   * Generates the JSON Schema fragment for this type.
   * Called by the JSON Schema generator phase (A3).
   */
  toJsonSchema(payload: JsonValue, context: GenerationContext): JsonValue;
}
```

### 9.3 Custom Constraint Registration

```typescript
interface CustomConstraintRegistration {
  /**
   * Unique name within this extension: `"<constraint-name>"`.
   * Full `constraintId` will be `"<extensionId>/<constraint-name>"`.
   */
  readonly constraintName: string;

  /**
   * Composition rule declaration (E2 — must be explicit).
   */
  readonly compositionRule: 'intersect' | 'override';

  /**
   * Set of type kinds this constraint may be applied to.
   * Passing `null` means "any type" (rare — use only if truly type-agnostic).
   */
  readonly applicableTypes: readonly TypeNode['kind'][] | null;

  /**
   * Generates the JSON Schema contribution for this constraint.
   * May return additional properties to merge into the field's schema fragment.
   * Properties must use the configured vendor prefix (E3).
   */
  toJsonSchema(payload: JsonValue, context: GenerationContext): Record<string, JsonValue>;
}
```

### 9.4 Vendor Prefix Configuration

Per E3, all custom vocabulary keywords use a configurable vendor prefix. The prefix is configured in `.formspec.yml`:

```yaml
vendor:
  prefix: 'x-stripe' # defaults to "x-formspec"
```

The extension registration system substitutes the configured prefix at emit time. Extensions never hard-code their keyword prefix — they register keyword names without the prefix, and the generation context provides the effective prefix:

```typescript
interface GenerationContext {
  /**
   * The configured vendor prefix, e.g., "x-stripe".
   * Use this to construct output keyword names: `${vendorPrefix}-my-keyword`.
   */
  readonly vendorPrefix: string;
  // ... other generation context
}
```

This satisfies PP10 (white-labelable): organizations set their own prefix once in configuration; it propagates everywhere automatically.

---

## 10. The Top-Level IR: `FormIR`

Having defined the nodes, this section assembles the complete top-level IR structure.

### 10.1 `FieldNode`

A `FieldNode` represents a single form field after canonicalization — its type is resolved, constraints and annotations are merged, and provenance is attached.

```typescript
interface FieldNode {
  readonly kind: 'field';
  /** The field's key in the data schema. */
  readonly name: string;
  /** The resolved type of this field. */
  readonly type: TypeNode;
  /**
   * Whether this field is required in the data schema.
   * Distinct from the field being visible in the UI — a conditional
   * field is optional (may be absent) even when the condition is met (C3, S8).
   */
  readonly required: boolean;
  /** Set-influencing constraints on this field, after merging. */
  readonly constraints: readonly ConstraintNode[];
  /** Value-influencing annotations on this field, after merging. */
  readonly annotations: readonly AnnotationNode[];
  /** Where this field was declared. */
  readonly provenance: Provenance;
  /** Debug only — see section 7.4. */
  readonly mergeHistory?: readonly {
    readonly node: ConstraintNode | AnnotationNode;
    readonly dominated: boolean;
  }[];
}
```

### 10.2 Layout Nodes

Layout nodes capture UI structure without affecting the data schema (C2). They are separate from `FieldNode` — the JSON Schema generator ignores them entirely; the UI Schema generator consumes them exclusively.

```typescript
type LayoutNode = GroupLayoutNode | ConditionalLayoutNode;

interface GroupLayoutNode {
  readonly kind: 'group';
  readonly label: string;
  /** Elements contained in this group — may be fields or nested groups. */
  readonly elements: readonly FormIRElement[];
  readonly provenance: Provenance;
}

interface ConditionalLayoutNode {
  readonly kind: 'conditional';
  /**
   * The field whose value triggers visibility.
   * Must reference a field that exists at the same scope level.
   */
  readonly fieldName: string;
  /** The value that makes the condition true (SHOW). */
  readonly value: JsonValue;
  /** Elements shown when the condition is met. */
  readonly elements: readonly FormIRElement[];
  readonly provenance: Provenance;
}

type FormIRElement = FieldNode | LayoutNode;
```

**Note on JSON Forms layout types:** The IR's layout nodes represent authoring-level structure (groups, conditionals). JSON Forms layout types (`VerticalLayout`, `HorizontalLayout`, `Categorization`, `Category`) are **not** represented in the IR. Instead, the UI Schema generator accepts a generation-time configuration that controls how IR elements are wrapped in layout containers. For example, a consumer can configure "wrap all top-level elements in a VerticalLayout" without the form author needing to express this in their source code. This keeps the IR focused on semantics (per A4) and moves presentational framing to build configuration (per C2, PP9).

### 10.3 `TypeDefinition` Registry

Named types referenced via `ReferenceTypeNode` are stored in a flat registry on the `FormIR`. This enables JSON Schema generators to emit a single `$defs` block (PP7).

```typescript
interface TypeDefinition {
  /** The fully-qualified reference name (key in the registry). */
  readonly name: string;
  /** The resolved type node. */
  readonly type: TypeNode;
  /** Where this type was declared. */
  readonly provenance: Provenance;
}
```

### 10.4 `FormIR`

```typescript
/**
 * The complete Canonical Intermediate Representation for a form.
 *
 * This is the output of the Canonicalize phase (A5) and the input to
 * all downstream phases: Validate, Generate (JSON Schema), Generate (UI Schema).
 *
 * Serializable to JSON (A2). No live compiler objects.
 */
interface FormIR {
  readonly kind: 'form-ir';
  /**
   * Schema version for the IR format itself. Allows tooling to detect
   * incompatible IR versions when IR artifacts are persisted.
   */
  readonly irVersion: string;
  /**
   * Top-level elements of the form: fields and layout nodes.
   */
  readonly elements: readonly FormIRElement[];
  /**
   * Registry of named types referenced by fields in this form.
   * Keys are fully-qualified type names matching `ReferenceTypeNode.name`.
   * Generators use this to emit `$defs` in JSON Schema (PP7).
   */
  readonly typeRegistry: Record<string, TypeDefinition>;
  /**
   * Provenance of the form definition itself (the `formspec(...)` call
   * or the annotated type declaration).
   */
  readonly provenance: Provenance;
}
```

---

## 11. Migration Mapping

This section maps current codebase types to the new IR. It is the bridge between the existing implementation and the target architecture, satisfying A1 (both surfaces produce the same IR) and NP1 (decorators are removed).

### 11.1 `FormElement` → `FormIRElement`

The current `FormElement` discriminated union maps to `FormIRElement` as follows:

| Current Type                  | Maps to IR                                                   |
| ----------------------------- | ------------------------------------------------------------ |
| `TextField<N>`                | `FieldNode` with `PrimitiveTypeNode("string")`               |
| `NumberField<N>`              | `FieldNode` with `PrimitiveTypeNode("number")`               |
| `BooleanField<N>`             | `FieldNode` with `PrimitiveTypeNode("boolean")`              |
| `StaticEnumField<N, O>`       | `FieldNode` with `EnumTypeNode` (members from `options`)     |
| `DynamicEnumField<N, Source>` | `FieldNode` with `DynamicTypeNode("enum", source)`           |
| `DynamicSchemaField<N>`       | `FieldNode` with `DynamicTypeNode("schema", schemaSource)`   |
| `ArrayField<N, Items>`        | `FieldNode` with `ArrayTypeNode` (items from elements)       |
| `ObjectField<N, Props>`       | `FieldNode` with `ObjectTypeNode` (properties from elements) |
| `Group<Elements>`             | `GroupLayoutNode`                                            |
| `Conditional<K, V, Elements>` | `ConditionalLayoutNode`                                      |

The chain DSL canonicalizer walks the `FormSpec<Elements>` structure and produces `FormIR`. Inline options on chain DSL fields (`label`, `min`, `max`, `required`, etc.) become `AnnotationNode` and `ConstraintNode` entries with `surface: "chain-dsl"` provenance.

Specifically:

- `label` → `DisplayNameAnnotationNode`
- `placeholder` → `PlaceholderAnnotationNode`
- `required` → sets `FieldNode.required`
- `min` / `max` → `NumericConstraintNode("minimum")` / `NumericConstraintNode("maximum")`
- `minItems` / `maxItems` → `LengthConstraintNode("minItems")` / `LengthConstraintNode("maxItems")`

### 11.2 `FieldInfo` + `DecoratorInfo` → `FieldNode`

The current TSDoc-annotated type path produces `FieldInfo[]` via static analysis. Under the new architecture, this analysis still runs, but its output is canonicalized to `FieldNode` rather than passed directly to `applyDecoratorsToSchema`.

| Current `FieldInfo` property   | Maps to IR                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| `name`                         | `FieldNode.name`                                            |
| `type` (ts.Type)               | Resolved to a `TypeNode` by the type-to-IR converter        |
| `optional`                     | `FieldNode.required = !optional`                            |
| `deprecated`                   | `DeprecatedAnnotationNode`                                  |
| `defaultValue`                 | `DefaultValueAnnotationNode`                                |
| `decorators` (DecoratorInfo[]) | Each decorator becomes `ConstraintNode` or `AnnotationNode` |

The `DecoratorInfo` entries (including synthetic JSDoc ones) map as follows:

| Current Decorator Name   | Maps to IR                                     |
| ------------------------ | ---------------------------------------------- |
| `Minimum(n)`             | `NumericConstraintNode("minimum", n)`          |
| `Maximum(n)`             | `NumericConstraintNode("maximum", n)`          |
| `ExclusiveMinimum(n)`    | `NumericConstraintNode("exclusiveMinimum", n)` |
| `ExclusiveMaximum(n)`    | `NumericConstraintNode("exclusiveMaximum", n)` |
| `MinLength(n)`           | `LengthConstraintNode("minLength", n)`         |
| `MaxLength(n)`           | `LengthConstraintNode("maxLength", n)`         |
| `Pattern(s)`             | `PatternConstraintNode(s)`                     |
| `Field({ displayName })` | `DisplayNameAnnotationNode(displayName)`       |
| `Field({ description })` | `DescriptionAnnotationNode(description)`       |
| `Field({ placeholder })` | `PlaceholderAnnotationNode(placeholder)`       |
| `EnumOptions([...])`     | Overrides enum members on the `EnumTypeNode`   |

**NP1 note:** `@formspec/decorators` and all decorator-specific resolution logic (`resolveDecorator`, branded type reading, `FORMSPEC_EXTENDS`/`FORMSPEC_EXTENSION` symbols) are removed. The decorator names in the table above survive only as TSDoc tag names — the same semantic content, different surface syntax.

### 11.3 `CONSTRAINT_TAG_DEFINITIONS` → IR Constraint Kinds

The current `CONSTRAINT_TAG_DEFINITIONS` map in `@formspec/core` serves as the source of truth for recognized TSDoc constraint tags. Under the new architecture, this map is superseded by the extension registry: built-in constraint registrations declare their TSDoc tag names, and the tag parser looks up registrations by name.

`CONSTRAINT_TAG_DEFINITIONS` can be preserved as a compatibility export during migration, but it is no longer the authoritative list.

### 11.4 `ConstraintConfig` → Profile-Based IR Filtering

The current `ConstraintConfig` type (in `@formspec/constraints`) governs which FormSpec features are allowed at all in a project (PP9). Under the new architecture, `ConstraintConfig` becomes a **profile** that filters the Validate phase: after contradiction checking, the validator checks that every feature used is permitted by the active profile.

The current `FieldTypeConstraints`, `LayoutConstraints`, etc. map naturally to constraints on the IR's node kinds:

| Current `ConstraintConfig` key    | IR enforcement                                         |
| --------------------------------- | ------------------------------------------------------ |
| `fieldTypes.dynamicEnum: "error"` | Error if any `FieldNode` has `DynamicTypeNode("enum")` |
| `layout.group: "off"`             | No restriction if any `GroupLayoutNode` is present     |
| `layout.conditionals: "warn"`     | Warning if any `ConditionalLayoutNode` is present      |
| `layout.maxNestingDepth: N`       | Error if object nesting depth exceeds N                |

This enforcement happens during the Validate phase on the IR — not during canonicalization and not in the generators (A5, B1).

---

## Appendix: Open Decisions Summary

| ID   | Section | Decision                                                                |
| ---- | ------- | ----------------------------------------------------------------------- |
| OD-1 | 2.7     | Circular type representation: registry-based `$ref` vs. forbidden cycle |
| OD-2 | 3.4     | `patternProperties` support for object types                            |

Open decisions are resolved before implementation begins on affected sections. Resolution is recorded by amending this document.
