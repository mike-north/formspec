# @formspec/constraints

Define and enforce constraints on which FormSpec DSL features are allowed in your project.

## Overview

The constraints package lets you restrict which parts of the FormSpec DSL can be used. This is useful for:

- **Standardization**: Enforce consistent form patterns across a team
- **Compatibility**: Restrict to features your renderer supports
- **Simplicity**: Keep forms simple by disallowing complex nesting or conditionals
- **Linting**: Catch constraint violations at development time via ESLint

## Installation

```bash
npm install @formspec/constraints
# or
pnpm add @formspec/constraints
```

## Configuration

Create a `.formspec.yml` file in your project root:

```yaml
constraints:
  fieldTypes:
    text: off          # Allow text fields
    number: off        # Allow number fields
    boolean: off       # Allow boolean fields
    staticEnum: off    # Allow static enums
    dynamicEnum: warn  # Warn on dynamic enums
    dynamicSchema: error  # Disallow dynamic schemas
    array: off         # Allow arrays
    object: off        # Allow objects

  layout:
    group: off         # Allow groups
    conditionals: off  # Allow when() conditionals
    maxNestingDepth: 3 # Max nesting depth (0 = flat only)

  fieldOptions:
    label: off
    placeholder: off
    required: off
    minValue: off
    maxValue: off
    minItems: off
    maxItems: off
```

### Severity Levels

Each constraint can be set to:

| Severity | Behavior |
|----------|----------|
| `"off"` | Feature is allowed (default) |
| `"warn"` | Emit warning but allow |
| `"error"` | Disallow - fail validation |

## Constraint Categories

### Field Types (`fieldTypes`)

Control which DSL field builders are allowed:

| Constraint | DSL Function |
|------------|--------------|
| `text` | `field.text()` |
| `number` | `field.number()` |
| `boolean` | `field.boolean()` |
| `staticEnum` | `field.enum()` |
| `dynamicEnum` | `field.dynamicEnum()` |
| `dynamicSchema` | `field.dynamicSchema()` |
| `array` | `field.array()`, `field.arrayWithConfig()` |
| `object` | `field.object()`, `field.objectWithConfig()` |

### Layout (`layout`)

Control structure and nesting:

| Constraint | Description |
|------------|-------------|
| `group` | `group()` visual grouping |
| `conditionals` | `when()` conditional visibility |
| `maxNestingDepth` | Maximum depth for nested objects/arrays |

### Field Options (`fieldOptions`)

Control which field configuration options are allowed:

| Constraint | Description |
|------------|-------------|
| `label` | Field label text |
| `placeholder` | Input placeholder |
| `required` | Required field validation |
| `minValue`, `maxValue` | Number field constraints |
| `minItems`, `maxItems` | Array length constraints |

### UI Schema (`uiSchema`)

Control JSON Forms-specific features:

```yaml
constraints:
  uiSchema:
    layouts:
      VerticalLayout: off
      HorizontalLayout: off
      Group: off
      Categorization: error  # Disallow tabbed interfaces
      Category: error
    rules:
      enabled: off
      effects:
        SHOW: off
        HIDE: off
        ENABLE: warn
        DISABLE: warn
```

## Programmatic Usage

### Loading Configuration

```typescript
import { loadConfig, mergeWithDefaults } from "@formspec/constraints";

// Load from .formspec.yml (searches up directory tree)
const config = await loadConfig();

// Or load from specific path
const config = await loadConfig("/path/to/.formspec.yml");

// Merge with defaults to get fully resolved config
const resolved = mergeWithDefaults(config.constraints);
```

### Validating Forms

```typescript
import { validateFormSpec } from "@formspec/constraints";
import { formspec, field, when, is } from "@formspec/dsl";

const form = formspec(
  field.text("name"),
  field.dynamicEnum("country", "fetch_countries"),
  when(is("country", "US"),
    field.text("state"),
  ),
);

const result = validateFormSpec(form, resolved);

if (!result.valid) {
  for (const issue of result.issues) {
    console.log(`${issue.severity}: ${issue.message}`);
  }
}
```

### Validation Result

```typescript
interface ValidationResult {
  valid: boolean;  // true if no errors (warnings OK)
  issues: ValidationIssue[];
}

interface ValidationIssue {
  code: string;           // e.g., "FIELD_TYPE_NOT_ALLOWED"
  message: string;        // Human-readable description
  severity: "error" | "warning";
  category: "fieldTypes" | "layout" | "uiSchema" | "fieldOptions" | "controlOptions";
  path?: string;          // JSON pointer to issue location
  fieldName?: string;     // Affected field name
  fieldType?: string;     // Affected field type
}
```

## ESLint Integration

Use `@formspec/eslint-plugin` to catch constraint violations at development time:

```javascript
// eslint.config.js
import formspec from "@formspec/eslint-plugin";

export default [
  {
    plugins: { formspec },
    rules: {
      // Enforce allowed field types from .formspec.yml
      "formspec/constraints-allowed-field-types": "error",
      // Enforce allowed layouts from .formspec.yml
      "formspec/constraints-allowed-layouts": "error",
    },
  },
];
```

The ESLint rules automatically load constraints from your `.formspec.yml` file.

## Example Configurations

### Simple Forms Only

Restrict to flat forms with basic field types:

```yaml
constraints:
  fieldTypes:
    array: error
    object: error
    dynamicEnum: error
    dynamicSchema: error
  layout:
    conditionals: error
    maxNestingDepth: 0
```

### JSON Forms Compatible

Restrict to features supported by standard JSON Forms renderers:

```yaml
constraints:
  fieldTypes:
    dynamicSchema: error  # Not supported by JSON Forms
  uiSchema:
    layouts:
      Categorization: warn  # May not be supported by all renderers
```

### Warn on Advanced Features

Allow all features but warn on complex ones:

```yaml
constraints:
  fieldTypes:
    dynamicEnum: warn
    dynamicSchema: warn
    array: warn
    object: warn
  layout:
    conditionals: warn
    maxNestingDepth: 2
```

## JSON Schema

A JSON Schema for `.formspec.yml` is available for editor autocompletion:

```yaml
# .formspec.yml
# yaml-language-server: $schema=node_modules/@formspec/constraints/formspec.schema.json

constraints:
  fieldTypes:
    text: off
    # ... autocomplete available
```
