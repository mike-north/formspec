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
import {
  defineAnnotation,
  defineConstraint,
  defineCustomType,
  defineExtension,
} from "@formspec/core";

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

const displayCurrency = defineAnnotation({
  annotationName: "DisplayCurrency",
  inheritFromBase: "local-wins",
});

const extension = defineExtension({
  extensionId: "x-example/decimal",
  types: [decimalType],
  constraints: [],
  annotations: [displayCurrency],
});
```

`inheritFromBase` is semantic inheritance only. It lets a type-level custom annotation flow through class/interface heritage and named type-alias entry points when the derived declaration does not declare the same extension annotation locally, but it does not serialize the annotation to JSON Schema. Schema emission remains controlled by the optional existing `toJsonSchema` hook, so property-level annotation inheritance and metadata-slot inheritance remain out of scope.

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
- `createInitialFieldState`
- `IR_VERSION`
- field and layout type guards

## Entry Points

| Entry point                | Purpose                                |
| -------------------------- | -------------------------------------- |
| `@formspec/core`           | Stable public types and extension APIs |
| `@formspec/core/internals` | Unstable low-level internal types      |

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.
