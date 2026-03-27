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

export default [...formspec.configs.recommended];
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
      "@formspec/tag-recognition/no-unknown-tags": "warn",
      "@formspec/tag-recognition/require-tag-arguments": "error",
      "@formspec/tag-recognition/no-disabled-tags": "warn",
      "@formspec/value-parsing/valid-numeric-value": "error",
      "@formspec/value-parsing/valid-integer-value": "error",
      "@formspec/value-parsing/valid-regex-pattern": "error",
      "@formspec/value-parsing/valid-json-value": "error",
      "@formspec/type-compatibility/tag-type-check": "error",
      "@formspec/target-resolution/valid-path-target": "error",
      "@formspec/target-resolution/valid-member-target": "error",
      "@formspec/target-resolution/no-unsupported-targeting": "error",
      "@formspec/target-resolution/no-member-target-on-object": "error",
      "@formspec/constraint-validation/no-contradictions": "error",
      "@formspec/constraint-validation/no-duplicate-tags": "warn",
      "@formspec/constraint-validation/no-description-conflict": "warn",
      "@formspec/constraint-validation/no-contradictory-rules": "error",
      "@formspec/constraints-allowed-field-types": "error",
      "@formspec/constraints-allowed-layouts": "error",
    },
  },
];
```

## Rules

| Rule                                                                  | Description                                       | Recommended | Strict |
| --------------------------------------------------------------------- | ------------------------------------------------- | ----------- | ------ |
| [`tag-recognition/no-unknown-tags`](#tag-recognitionno-unknown-tags) | Reject unknown FormSpec tags                      | warn        | error  |
| [`tag-recognition/require-tag-arguments`](#tag-recognitionrequire-tag-arguments) | Require arguments for tags that need values | error | error |
| [`tag-recognition/no-disabled-tags`](#tag-recognitionno-disabled-tags) | Reject project-disabled tags                    | warn        | error  |
| [`value-parsing/valid-numeric-value`](#value-parsingvalid-numeric-value) | Validate numeric-valued tags                   | error       | error  |
| [`value-parsing/valid-integer-value`](#value-parsingvalid-integer-value) | Validate non-negative integer-valued tags     | error       | error  |
| [`value-parsing/valid-regex-pattern`](#value-parsingvalid-regex-pattern) | Validate `@pattern` values                     | error       | error  |
| [`value-parsing/valid-json-value`](#value-parsingvalid-json-value) | Validate JSON-valued tags                          | error       | error  |
| [`type-compatibility/tag-type-check`](#type-compatibilitytag-type-check) | FormSpec tags must match field type           | error       | error  |
| [`target-resolution/valid-path-target`](#target-resolutionvalid-path-target) | Validate `:path` target references          | error       | error  |
| [`target-resolution/valid-member-target`](#target-resolutionvalid-member-target) | Validate `:member` target references     | error       | error  |
| [`target-resolution/no-unsupported-targeting`](#target-resolutionno-unsupported-targeting) | Reject target syntax on unsupported tags | error | error |
| [`target-resolution/no-member-target-on-object`](#target-resolutionno-member-target-on-object) | Restrict member targets to string-literal unions | error | error |
| [`constraint-validation/no-contradictions`](#constraint-validationno-contradictions) | Constraint ranges must be valid            | error       | error  |
| [`constraint-validation/no-duplicate-tags`](#constraint-validationno-duplicate-tags) | Reject duplicate single-instance tags   | warn        | error  |
| [`constraint-validation/no-description-conflict`](#constraint-validationno-description-conflict) | Report `@description`/`@remarks` conflicts | warn | error |
| [`constraint-validation/no-contradictory-rules`](#constraint-validationno-contradictory-rules) | Reject conflicting conditional effects | error | error |
| [`constraints-allowed-field-types`](#constraints-allowed-field-types) | Field types validated against `.formspec.yml`     | —           | —      |
| [`constraints-allowed-layouts`](#constraints-allowed-layouts)         | Layout elements validated against `.formspec.yml` | —           | —      |

### tag-recognition/no-unknown-tags

Rejects tags outside the FormSpec specification.

### tag-recognition/require-tag-arguments

Requires values for tags like `@minimum`, `@description`, and `@showWhen`.

### tag-recognition/no-disabled-tags

Rejects tags disabled by project-specific configuration.

### value-parsing/valid-numeric-value

Ensures numeric tags such as `@minimum` and `@multipleOf` contain valid numbers.

### value-parsing/valid-integer-value

Ensures integer-only tags such as `@minLength` and `@maxItems` contain non-negative integers.

### value-parsing/valid-regex-pattern

Ensures `@pattern` contains a valid JavaScript regular expression body.

### value-parsing/valid-json-value

Ensures JSON-valued tags such as `@const` and `@enumOptions` contain valid JSON.

### type-compatibility/tag-type-check

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

### constraint-validation/no-contradictions

Ensures constraint values form valid ranges.

```typescript
// Valid
/** @Minimum 0 @Maximum 100 */
value!: number;

// Invalid — minimum > maximum
/** @Minimum 100 @Maximum 50 */
value!: number; // Error: @Minimum(100) > @Maximum(50)
```

### target-resolution/valid-path-target

Validates `:path` target references against object field types.

### target-resolution/valid-member-target

Validates `:member` target references against string literal union fields.

### target-resolution/no-unsupported-targeting

Rejects `:path` or `:member` syntax on tags that do not support targeting.

### target-resolution/no-member-target-on-object

Restricts member-target syntax to string literal union fields.

### constraint-validation/no-duplicate-tags

Rejects duplicate single-instance tags on the same field target.

### constraint-validation/no-description-conflict

Reports when both `@description` and `@remarks` are present on the same field.

### constraint-validation/no-contradictory-rules

Rejects conflicting conditional effects such as `@showWhen` plus `@hideWhen`.

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

Enables the spec-defined built-in rules with recommended severities. The `constraints-allowed-*` rules must be enabled manually when using `.formspec.yml` constraints.

### Strict

Same rule set as Recommended, but all built-in rules are promoted to errors. The `constraints-allowed-*` rules must be enabled manually when using `.formspec.yml` constraints.

```javascript
import formspec from "@formspec/eslint-plugin";

export default [...formspec.configs.strict];
```

## License

UNLICENSED
