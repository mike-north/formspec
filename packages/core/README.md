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

| Type | Description |
|------|-------------|
| `TextField` | Text input field |
| `NumberField` | Numeric input field |
| `BooleanField` | Boolean/checkbox field |
| `StaticEnumField` | Dropdown with static options |
| `DynamicEnumField` | Dropdown with dynamic options from resolver |
| `DynamicSchemaField` | Field with dynamic schema from resolver |
| `ArrayField` | Array of nested elements |
| `ObjectField` | Nested object with child fields |
| `AnyField` | Union of all field types |

### Structural Types

| Type | Description |
|------|-------------|
| `Group` | Groups related fields with a label |
| `Conditional` | Shows fields based on predicate |
| `FormElement` | Union of `AnyField`, `Group`, `Conditional` |
| `FormSpec<E>` | Complete form specification |

### State Types

| Type | Description |
|------|-------------|
| `Validity` | `"valid"`, `"invalid"`, `"unknown"` |
| `FieldState<T>` | Runtime state of a single field |
| `FormState<S>` | Runtime state of entire form |

## License

UNLICENSED
