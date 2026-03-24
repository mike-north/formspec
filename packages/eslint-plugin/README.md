# @formspec/eslint-plugin

ESLint plugin for validating FormSpec usage in TypeScript projects. Catches constraint mismatches, invalid ranges, and enforces project-level restrictions from `.formspec.yml`.

## Installation

```bash
npm install --save-dev @formspec/eslint-plugin
# or
pnpm add -D @formspec/eslint-plugin
```

## Requirements

- ESLint v9+ (flat config)
- TypeScript v5+
- `@typescript-eslint/parser`

## Usage

### Recommended Configuration

```javascript
import formspec from "@formspec/eslint-plugin";

export default [
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
      "@formspec/constraint-type-mismatch": "error",
      "@formspec/consistent-constraints": "error",
      "@formspec/constraints-allowed-field-types": "error",
      "@formspec/constraints-allowed-layouts": "error",
    },
  },
];
```

## Rules

| Rule | Description | Recommended | Strict |
| --- | --- | --- | --- |
| [`constraint-type-mismatch`](#constraint-type-mismatch) | JSDoc constraint tags must match field type | error | error |
| [`consistent-constraints`](#consistent-constraints) | Constraint ranges must be valid (min ≤ max) | error | error |
| [`constraints-allowed-field-types`](#constraints-allowed-field-types) | Field types validated against `.formspec.yml` | — | — |
| [`constraints-allowed-layouts`](#constraints-allowed-layouts) | Layout elements validated against `.formspec.yml` | — | — |

### constraint-type-mismatch

Ensures JSDoc constraint tags are applied to fields with compatible types.

```typescript
// Valid — @Minimum on a number field
/** @Minimum 0 */
age!: number;

/** @MinLength 1 */
name!: string;

// Invalid — @Minimum requires a number field
/** @Minimum 0 */
name!: string; // Error: @Minimum can only be used on number fields
```

### consistent-constraints

Ensures constraint values form valid ranges.

```typescript
// Valid
/** @Minimum 0 @Maximum 100 */
value!: number;

// Invalid — minimum > maximum
/** @Minimum 100 @Maximum 50 */
value!: number; // Error: @Minimum(100) > @Maximum(50)
```

### constraints-allowed-field-types

Validates chain DSL field types against your `.formspec.yml` configuration.

```typescript
// With .formspec.yml: fieldTypes: { dynamicEnum: error }
field.dynamicEnum("country", "fetch_countries"); // Error: dynamicEnum fields are not allowed
```

### constraints-allowed-layouts

Validates layout elements against your `.formspec.yml` configuration.

```typescript
// With .formspec.yml: layout: { conditionals: error }
when(is("type", "a"), field.text("extra")); // Error: conditionals are not allowed
```

## Configurations

### Recommended

Enables `constraint-type-mismatch` and `consistent-constraints` as errors. The `constraints-allowed-*` rules must be enabled manually when using `.formspec.yml` constraints.

### Strict

Same as Recommended. The `constraints-allowed-*` rules must be enabled manually when using `.formspec.yml` constraints.

```javascript
import formspec from "@formspec/eslint-plugin";

export default [...formspec.configs.strict];
```

## License

UNLICENSED
