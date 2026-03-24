# @formspec/core

Core type definitions for the FormSpec library.

## Installation

```bash
npm install @formspec/core
# or
pnpm add @formspec/core
```

> **Note:** Most users should install the `formspec` umbrella package instead, which re-exports everything from this package.

## Requirements

This package is ESM-only and requires:

```json
// package.json
{
  "type": "module"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Overview

This package provides the foundational types used throughout the FormSpec ecosystem:

- **Form element types**: `TextField`, `NumberField`, `BooleanField`, `StaticEnumField`, `DynamicEnumField`, `ArrayField`, `ObjectField`
- **Structural types**: `Group`, `Conditional`, `FormElement`, `FormSpec`
- **State types**: `FieldState`, `FormState`, `Validity`
- **Data source types**: `DataSourceRegistry`, `DataSourceOption`, `FetchOptionsResponse`
- **Predicate types**: `EqualsPredicate`, `Predicate`
- **IR types**: `FormIR`, `FormIRElement`, `FieldNode`, `LayoutNode`, `TypeNode`, `ConstraintNode`, `AnnotationNode`, `Provenance`, `IR_VERSION`
- **Extension API**: `defineExtension`, `defineConstraint`, `defineAnnotation`, `defineCustomType`

## Usage

```typescript
import type {
  FormSpec,
  FormElement,
  TextField,
  NumberField,
  AnyField,
  Group,
  Conditional,
} from "@formspec/core";

// Type guard for field elements
function isField(element: FormElement): element is AnyField {
  return element._type === "field";
}

// Process form elements
function processForm(form: FormSpec<readonly FormElement[]>) {
  for (const element of form.elements) {
    if (isField(element)) {
      console.log(`Field: ${element.name} (${element._field})`);
    } else if (element._type === "group") {
      console.log(`Group: ${element.label}`);
    }
  }
}
```

## Type Reference

### Field Types

| Type                 | Description                                 |
| -------------------- | ------------------------------------------- |
| `TextField`          | Text input field                            |
| `NumberField`        | Numeric input field                         |
| `BooleanField`       | Boolean/checkbox field                      |
| `StaticEnumField`    | Dropdown with static options                |
| `DynamicEnumField`   | Dropdown with dynamic options from resolver |
| `DynamicSchemaField` | Field with dynamic schema from resolver     |
| `ArrayField`         | Array of nested elements                    |
| `ObjectField`        | Nested object with child fields             |
| `AnyField`           | Union of all field types                    |

### Structural Types

| Type          | Description                                 |
| ------------- | ------------------------------------------- |
| `Group`       | Groups related fields with a label          |
| `Conditional` | Shows fields based on predicate             |
| `FormElement` | Union of `AnyField`, `Group`, `Conditional` |
| `FormSpec<E>` | Complete form specification                 |

### State Types

| Type            | Description                         |
| --------------- | ----------------------------------- |
| `Validity`      | `"valid"`, `"invalid"`, `"unknown"` |
| `FieldState<T>` | Runtime state of a single field     |
| `FormState<S>`  | Runtime state of entire form        |

### IR Types

| Type             | Description                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FormIR`         | Root IR node — contains elements, type registry, IR version                                                                                                                       |
| `FormIRElement`  | Union of `FieldNode` and `LayoutNode`                                                                                                                                             |
| `FieldNode`      | IR field with name, type, constraints, annotations                                                                                                                                |
| `LayoutNode`     | Union of `GroupLayoutNode` and `ConditionalLayoutNode`                                                                                                                            |
| `TypeNode`       | Union: `PrimitiveTypeNode`, `EnumTypeNode`, `ArrayTypeNode`, `ObjectTypeNode`, `UnionTypeNode`, `ReferenceTypeNode`, `DynamicTypeNode`, `CustomTypeNode`                          |
| `ConstraintNode` | Union: `NumericConstraintNode`, `LengthConstraintNode`, `PatternConstraintNode`, `ArrayCardinalityConstraintNode`, `EnumMemberConstraintNode`, `CustomConstraintNode`             |
| `AnnotationNode` | Union: `DisplayNameAnnotationNode`, `DescriptionAnnotationNode`, `PlaceholderAnnotationNode`, `DefaultValueAnnotationNode`, `DeprecatedAnnotationNode`, `FormatHintAnnotationNode`, `CustomAnnotationNode` |
| `Provenance`     | Source location tracking — file, line, column, surface                                                                                                                            |
| `IR_VERSION`     | Current IR version (`"0.1.0"`)                                                                                                                                                    |

### Extension API

FormSpec's type system is extensible via registration functions:

| Function                  | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `defineExtension(def)`    | Register a complete extension with constraints, annotations, types, and vocabulary keywords |
| `defineConstraint(reg)`   | Register a custom constraint (e.g., `multipleOf`, `uniqueItems`)                 |
| `defineAnnotation(reg)`   | Register a custom annotation (e.g., tooltip, help URL)                           |
| `defineCustomType(reg)`   | Register a custom type node for JSON Schema generation                            |

```typescript
import { defineExtension, defineConstraint, defineAnnotation } from "@formspec/core";

// Register a complete extension
const myExtension = defineExtension({
  extensionId: "my-ext",
  constraints: [
    {
      constraintName: "Precision",
      applicableTypes: ["primitive"],
      compositionRule: "override",
      toJsonSchema: (payload, vendorPrefix) => ({ [`${vendorPrefix}-precision`]: payload }),
    },
  ],
  annotations: [
    {
      annotationName: "HelpUrl",
      toJsonSchema: (value, vendorPrefix) => ({ [`${vendorPrefix}-help-url`]: value }),
    },
  ],
});
```

## License

UNLICENSED
