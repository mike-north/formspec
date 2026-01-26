# Formspec DSL Experiments Summary

This document summarizes the DSL design experiments conducted to find an optimal approach for defining form specifications with full TypeScript type inference.

## Goals

1. **Expressive** - The DSL should feel natural and readable
2. **No duplication** - Field definitions should not require separate schema and UI declarations
3. **Type-safe** - Field references and condition values should be validated at compile time
4. **Structural semantics** - Nesting should represent both layout AND conditional logic
5. **Support dynamic data** - Enum options from APIs, extensible field sets

---

## Experiments Conducted

### 1. JSX Descriptor DSL

**File:** `jsx-descriptor-dsl.tsx`

**Approach:** Use actual JSX syntax for form definitions.

```tsx
// What we wished we could write:
const ContactForm = (
  <Form>
    <TextField name="name" label="Full Name" />
    <NumberField name="age" min={0} max={150} />
    <SelectField name="plan" options={["free", "pro"]} />
  </Form>
);
```

**Result:** **Not viable.**

See [Appendix: Why JSX Cannot Work](#appendix-why-jsx-cannot-work) for the detailed technical explanation.

---

### 2. Function Composition DSL

**File:** `function-composition-dsl.tsx`

**Approach:** Use function calls that visually resemble JSX.

```typescript
const ContactForm = Form(
  TextField("name", { label: "Full Name" }),
  TextField("email", { placeholder: "you@example.com" }),
  NumberField("age", { min: 0, max: 150 }),
  SelectField("plan", ["free", "pro", "enterprise"] as const),
  Checkbox("subscribe", { label: "Get updates" }),
);
```

**Result:** **Works well for simple forms.**

- Full type inference (schema inferred from field definitions)
- JSX-like readability
- Supports custom layouts via `ContactForm.fields.name` components

**Limitations:**
- No built-in grouping or conditional logic
- Requires `as const` for literal type preservation

---

### 3. Builder Pattern DSL

**File:** `builder-pattern-dsl.tsx`

**Approach:** Fluent API that accumulates types through method chaining.

```typescript
const ContactForm = createForm("Contact")
  .text("name", { label: "Full Name" })
  .text("email", { placeholder: "you@example.com" })
  .number("age", { min: 0, max: 150 })
  .select("plan", ["free", "pro", "enterprise"] as const)
  .checkbox("subscribe", { label: "Get updates" })
  .build();
```

**Result:** **Works, but verbose.**

- Each method returns a new builder with expanded schema type
- Clear construction phases (chain → build)
- Good IDE autocomplete

**Limitations:**
- Longer than function composition
- No nesting for groups or conditionals
- `.build()` step feels ceremonial

---

### 4. Two-Phase Formspec DSL

**File:** `formspec-dsl.tsx`

**Approach:** Separate field definitions from UI layout.

```typescript
const InvoiceForm = formspec(
  {
    customerName: field.text({ label: "Customer Name" }),
    amount: field.number({ min: 0 }),
    status: field.enum(["draft", "sent", "paid"] as const),
  },
  (ui) => [
    ui.group("Customer", ui.control("customerName")),
    ui.group("Invoice",
      ui.control("amount"),
      ui.control("status"),
      ui.when("status", "draft", ui.control("notes")),
    ),
  ]
);
```

**Result:** **Type-safe, but redundant.**

- Full type inference for schema
- Type-safe field references in UI (`ui.control("customerName")` validates)
- Type-safe condition values (`ui.when("status", "draft", ...)` validates "draft")
- Supports dynamic enums and extensions

**Limitations:**
- **Duplication** - Fields defined in phase 1, referenced again in phase 2
- Users asked: "Why do I define `customerName` and then say `ui.control('customerName')`?"

---

### 5. Unified Structure DSL (Recommended)

**File:** `unified-structure-dsl.tsx`

**Approach:** The structure IS the definition. Fields are defined inside their UI context.

```typescript
const InvoiceForm = formspec(
  group(
    "Customer",
    field.text("customerName", { label: "Customer Name" }),
    field.dynamicEnum("country", "countries", { label: "Country" }),
  ),

  group(
    "Invoice Details",
    field.number("amount", { label: "Amount", min: 0 }),
    field.enum("status", ["draft", "sent", "paid"] as const, { label: "Status" }),

    when(
      "status",
      "draft",
      field.text("internalNotes", { label: "Internal Notes" }),
    ),
  ),
);
```

**Result:** **Best balance of expressiveness and type safety.**

---

## Recommendation: Unified Structure DSL

### Why This Approach Wins

| Concern | How It's Addressed |
|---------|-------------------|
| **No duplication** | Fields defined once, in their UI context |
| **Layout from structure** | `group()` nesting = visual grouping |
| **Conditionals from structure** | `when()` nesting = conditional visibility |
| **Field type → control type** | `field.text` implies text input, `field.enum` implies dropdown |
| **Ordering from position** | Array position = render order |
| **Schema inference** | All fields extracted recursively from nested structure |
| **Dynamic data** | `field.dynamicEnum("source")` for API-fetched options |

### Inferred Schema

From the example above, TypeScript infers:

```typescript
type InvoiceFormSchema = {
  customerName: string;
  country: string;         // from DataSourceRegistry
  amount: number;
  status: "draft" | "sent" | "paid";
  internalNotes: string;   // inside conditional, still in schema
}
```

### Alignment with JSON Forms

The DSL aligns with [JSON Forms](https://jsonforms.io/docs/uischema/layouts) concepts:

| JSON Forms | Our DSL |
|------------|---------|
| `{ type: "Group", label: "...", elements: [...] }` | `group("...", ...)` |
| `{ type: "Control", scope: "#/properties/name" }` | `field.text("name", {...})` |
| Rules with `condition` | `when("field", value, ...)` |

The key difference: JSON Forms separates schema (JSON Schema) from UI schema. Our DSL unifies them—field definitions carry both schema type AND UI intent.

### Dynamic Enums

For enum options fetched from an API:

```typescript
// Register the data source (module augmentation)
declare module "./unified-structure-dsl.js" {
  interface DataSourceRegistry {
    countries: { id: string; code: string; name: string };
  }
}

// Use in form
field.dynamicEnum("country", "countries", { label: "Country" })
```

The schema infers `country: string` (from `DataSourceRegistry["countries"]["id"]`).

---

## Trade-offs Acknowledged

### Type Safety of `when()` Conditions

The `when()` function captures field name and value as literal types, but validation that the field exists and the value matches happens at the structural level, not at the `when()` call site.

```typescript
// This compiles but "invalid" doesn't exist in the schema
when("invalid", "value", field.text("x"))
```

**Mitigation options:**
1. Runtime validation when processing the form spec
2. A lint rule or type-level validation at `formspec()` boundary
3. Accept this as a trade-off for simpler single-pass definition

### `as const` Requirement for Enums

Static enums need `as const` to preserve literal types:

```typescript
field.enum("status", ["draft", "sent", "paid"] as const)
```

Without it, the type becomes `string` instead of `"draft" | "sent" | "paid"`.

---

## Files Summary

| File | Approach | Verdict |
|------|----------|---------|
| `jsx-descriptor-dsl.tsx` | JSX syntax | Not viable (TS limitation) |
| `function-composition-dsl.tsx` | Function calls | Good, but no grouping/conditionals |
| `builder-pattern-dsl.tsx` | Method chaining | Works, but verbose |
| `formspec-dsl.tsx` | Two-phase (fields + UI) | Type-safe, but redundant |
| `unified-structure-dsl.tsx` | **Structure = definition** | **Recommended** |

---

## Next Steps

1. **Validate `when()` references** - Add type-level or runtime validation that conditional field references exist in the schema
2. **Additional field types** - Date, file upload, rich text, etc.
3. **Validation rules** - Required, min/max length, patterns, custom validators
4. **Serialization** - Convert form spec to JSON for storage/transmission
5. **Renderer** - Generate React components from form spec (separate concern)

---

## Appendix: Why JSX Cannot Work

JSX would be the most intuitive syntax for form definitions, but TypeScript's JSX type system has fundamental limitations that make it unsuitable for type-inferred schemas.

### The Problem

When you write JSX:

```tsx
<TextField name="name" label="Full Name" />
```

TypeScript transforms it to:

```typescript
TextField({ name: "name", label: "Full Name" })
```

This looks like a normal function call, so you might expect the return type to be whatever `TextField` returns. But TypeScript's JSX handling has special rules.

### TypeScript's JSX Requirements

1. **Components must return `ReactNode`** (or `JSX.Element`)
2. **The result is typed as `JSX.Element`**, not the actual return type of the function

So even if `TextField` returned a descriptor object at runtime:

```typescript
function TextField<N extends string>(props: { name: N }): TextDescriptor<N> {
  return { _kind: "text", name: props.name };
}
```

When used as JSX, TypeScript enforces:

```tsx
// ERROR: 'TextField' cannot be used as a JSX component.
// Its return type 'TextDescriptor<N>' is not a valid JSX element type.
<TextField name="name" />
```

### Why This Matters for Type Inference

Our goal is to infer a schema type from field definitions:

```typescript
// We want to infer: { name: string; age: number; plan: "free" | "pro" }
const form = (
  <Form>
    <TextField name="name" />
    <NumberField name="age" />
    <SelectField name="plan" options={["free", "pro"]} />
  </Form>
);
```

For this to work, the `Form` component would need to:
1. Receive children with their full descriptor types preserved
2. Extract field names and types from those descriptors
3. Return a form object typed with the inferred schema

But JSX children are typed as `ReactNode`, which is essentially:

```typescript
type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNode[];
```

All the rich type information (`name: "name"`, `options: ["free", "pro"]`) is erased. The `Form` component just sees "I have some ReactNode children" with no way to know what fields they represent.

### What We Tried

We attempted several workarounds:

**1. Custom JSX namespace**
```typescript
declare namespace JSX {
  interface Element {
    // Try to make JSX.Element carry our descriptor type
  }
}
```
This doesn't work because `JSX.Element` is a single type, not generic over the component's return type.

**2. Render props / function children**
```typescript
<Form>
  {(register) => [
    register.text("name"),
    register.number("age"),
  ]}
</Form>
```
This works for type inference but isn't JSX—it's just a function call disguised as JSX.

**3. Two-phase with ref collection**
Define fields first, then use JSX for layout. This works but introduces the duplication we wanted to avoid.

### The Fundamental Limitation

JSX was designed for **rendering UI**, not for **type-level metaprogramming**. Its type system assumes:

- Components produce visual output (`ReactNode`)
- Children are things to render, not data to analyze
- The structure is for React's reconciler, not for schema extraction

These assumptions are baked into TypeScript's JSX handling and cannot be changed without modifying TypeScript itself.

### The Solution: Function Calls

Function calls preserve return types:

```typescript
const result = TextField({ name: "name" });
// result: TextDescriptor<"name"> ✓ - type preserved!
```

So our DSL uses functions that *look* like JSX:

```typescript
// Instead of:  <TextField name="name" />
// We write:    field.text("name", { label: "Full Name" })

// Instead of:  <Group label="Customer">...</Group>
// We write:    group("Customer", ...)
```

The visual difference is minimal:
- `< >` becomes `( )`
- Attributes become function arguments
- Nesting works the same way

But the type inference difference is fundamental: function arguments and return types flow through TypeScript's inference system, while JSX children become opaque `ReactNode`.

### Summary

| Aspect | JSX | Function Calls |
|--------|-----|----------------|
| Return type | Always `JSX.Element` | Actual return type |
| Children types | Erased to `ReactNode` | Preserved as tuple |
| Schema inference | Not possible | Full inference |
| Syntax | `<Foo bar="x" />` | `foo({ bar: "x" })` or `foo("x")` |

JSX is excellent for what it was designed for—declarative UI rendering. But for type-inferred DSLs where we need to extract structural information at compile time, function composition is the only viable approach in TypeScript today.
