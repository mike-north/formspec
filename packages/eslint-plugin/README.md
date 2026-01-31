# @formspec/eslint-plugin

ESLint plugin for validating FormSpec decorator DSL usage in TypeScript projects. This plugin catches common mistakes by ensuring decorators match their field types and enforcing consistency rules.

## Installation

```bash
npm install --save-dev @formspec/eslint-plugin
# or
pnpm add -D @formspec/eslint-plugin
```

## Requirements

- ESLint v9+ (flat config)
- TypeScript v5+

## Usage

### Recommended Configuration

Add the plugin to your `eslint.config.js`:

```javascript
import formspec from "@formspec/eslint-plugin";

export default [
  // ... other configs
  ...formspec.configs.recommended,
];
```

### Manual Configuration

```javascript
import formspec from "@formspec/eslint-plugin";

export default [
  {
    plugins: {
      "@formspec": formspec,
    },
    rules: {
      "@formspec/decorator-field-type-mismatch": "error",
      "@formspec/enum-options-match-type": "error",
      "@formspec/showwhen-field-exists": "error",
      "@formspec/showwhen-suggests-optional": "warn",
      "@formspec/min-max-valid-range": "error",
      "@formspec/no-conflicting-decorators": "error",
      "@formspec/no-duplicate-decorators": "error",
    },
  },
];
```

## Rules

| Rule | Description | Recommended | Strict |
|------|-------------|-------------|--------|
| [`decorator-field-type-mismatch`](#decorator-field-type-mismatch) | Ensures decorators are applied to fields with compatible types | error | error |
| [`enum-options-match-type`](#enum-options-match-type) | Ensures @EnumOptions values match the field's union type | error | error |
| [`showwhen-field-exists`](#showwhen-field-exists) | Ensures @ShowWhen references a field that exists | error | error |
| [`showwhen-suggests-optional`](#showwhen-suggests-optional) | Suggests @ShowWhen fields should be optional | warn | error |
| [`min-max-valid-range`](#min-max-valid-range) | Ensures @Min/@Max have valid ranges | error | error |
| [`no-conflicting-decorators`](#no-conflicting-decorators) | Prevents decorators that imply conflicting types | error | error |
| [`no-duplicate-decorators`](#no-duplicate-decorators) | Prevents duplicate decorators on the same field | error | error |

### decorator-field-type-mismatch

Ensures FormSpec decorators are applied to fields with compatible types.

```typescript
// Valid
@Min(0)
@Max(100)
age!: number;

@Placeholder("Enter name")
name!: string;

@MinItems(1)
@MaxItems(10)
items!: string[];

// Invalid - @Min requires number field
@Min(0)
name!: string; // Error: @Min can only be used on number fields
```

### enum-options-match-type

Ensures @EnumOptions values match the field's TypeScript union type.

```typescript
// Valid - options match type
@EnumOptions(["draft", "published", "archived"])
status!: "draft" | "published" | "archived";

// Valid - object options with id property
@EnumOptions([{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }])
type!: "a" | "b";

// Valid - string type accepts any options
@EnumOptions(["any", "options"])
value!: string;

// Invalid - missing option "archived"
@EnumOptions(["draft", "published"])
status!: "draft" | "published" | "archived"; // Error: missing "archived"
```

### showwhen-field-exists

Ensures @ShowWhen references a field that exists in the same class.

```typescript
// Valid
@EnumOptions(["a", "b"])
type!: "a" | "b";

@ShowWhen({ _predicate: "equals", field: "type", value: "a" })
conditionalField?: string;

// Invalid - "nonexistent" field doesn't exist
@ShowWhen({ _predicate: "equals", field: "nonexistent", value: "x" })
conditionalField?: string; // Error: field "nonexistent" does not exist
```

### showwhen-suggests-optional

Suggests that fields with @ShowWhen should be marked as optional since they may not be present in the output.

```typescript
// Valid
@ShowWhen({ _predicate: "equals", field: "type", value: "a" })
conditionalField?: string; // Good - optional

// Warning
@ShowWhen({ _predicate: "equals", field: "type", value: "a" })
conditionalField!: string; // Warning: should be optional
```

### min-max-valid-range

Ensures @Min value is less than or equal to @Max value.

```typescript
// Valid
@Min(0)
@Max(100)
value!: number;

@Min(5)
@Max(5) // Equal is valid
exact!: number;

// Invalid
@Min(100)
@Max(50) // Error: @Min(100) > @Max(50)
invalid!: number;
```

### no-conflicting-decorators

Prevents using decorators that imply conflicting field types.

```typescript
// Valid - both imply number
@Min(0)
@Max(100)
value!: number;

// Invalid - @Min implies number, @Placeholder implies string
@Min(0)
@Placeholder("Enter value") // Error: conflicting decorators
field!: string;
```

### no-duplicate-decorators

Prevents applying the same decorator multiple times to a field.

```typescript
// Valid
@Label("Name")
@Placeholder("Enter name")
name!: string;

// Invalid
@Label("First")
@Label("Second") // Error: duplicate @Label
name!: string;
```

## Configurations

### Recommended

Sensible defaults for most projects:
- All type safety rules enabled as errors
- `showwhen-suggests-optional` as warning (not blocking)

### Strict

All rules enabled as errors for maximum type safety enforcement.

```javascript
import formspec from "@formspec/eslint-plugin";

export default [
  ...formspec.configs.strict,
];
```

## License

UNLICENSED
