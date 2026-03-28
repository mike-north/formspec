# @formspec/core

Shared types, canonical IR nodes, and extension registration APIs for FormSpec.

## Install

```bash
pnpm add @formspec/core
```

Most app code should prefer `formspec` unless you are building tooling, extensions, or lower-level integrations.

## Main Responsibilities

- Form element and state types
- Canonical IR types used by the build pipeline
- Constraint-definition metadata
- Extension registration helpers for custom types, constraints, and annotations
- Shared type guards

## Example

```ts
import type { FormElement, FormIR } from "@formspec/core";
import { defineConstraint, defineCustomType, defineExtension } from "@formspec/core";

function isFieldElement(element: FormElement): boolean {
  return element._type === "field";
}

const decimalType = defineCustomType({
  typeName: "Decimal",
  tsTypeNames: ["Decimal"],
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-decimal`]: true,
  }),
});

const extension = defineExtension({
  extensionId: "x-example/decimal",
  types: [decimalType],
  constraints: [],
  annotations: [],
});
```

## Key Exports

### Form Types

- `FormSpec`
- `FormElement`
- `AnyField`
- `Group`
- `Conditional`
- `FieldState`
- `FormState`

### IR Types

- `FormIR`
- `FieldNode`
- `LayoutNode`
- `TypeNode`
- `ConstraintNode`
- `AnnotationNode`
- `Provenance`

### Extension API

- `defineExtension`
- `defineConstraint`
- `defineConstraintTag`
- `defineAnnotation`
- `defineCustomType`

### Utilities

- `normalizeConstraintTagName`
- field and layout type guards

## License

UNLICENSED
