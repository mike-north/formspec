# @formspec/eslint-plugin

ESLint rules for FormSpec TSDoc tags and Chain DSL usage.

## Install

```bash
pnpm add -D @formspec/eslint-plugin @typescript-eslint/parser eslint
```

## Flat Config

### Recommended

```js
import formspec from "@formspec/eslint-plugin";

export default [...formspec.configs.recommended];
```

### Strict

```js
import formspec from "@formspec/eslint-plugin";

export default [...formspec.configs.strict];
```

### Manual

```js
import formspec from "@formspec/eslint-plugin";

export default [
  {
    plugins: {
      formspec,
    },
    rules: {
      "formspec/tag-recognition/no-unknown-tags": "warn",
      "formspec/tag-recognition/require-tag-arguments": "error",
      "formspec/value-parsing/valid-numeric-value": "error",
      "formspec/type-compatibility/tag-type-check": "error",
      "formspec/target-resolution/valid-path-target": "error",
      "formspec/constraint-validation/no-contradictions": "error",
      "formspec/constraint-validation/no-description-tag": "error",
    },
  },
];
```

## Keeping Docs Current

```bash
pnpm --filter @formspec/eslint-plugin run fix:eslint-docs
pnpm --filter @formspec/eslint-plugin run check:eslint-docs
```

## Rule Groups

### Tag Recognition

- `tag-recognition/no-unknown-tags`
- `tag-recognition/require-tag-arguments`
- `tag-recognition/no-disabled-tags`
- `tag-recognition/no-markdown-formatting`

### Value Parsing

- `value-parsing/valid-numeric-value`
- `value-parsing/valid-integer-value`
- `value-parsing/valid-regex-pattern`
- `value-parsing/valid-json-value`

### Type Compatibility

- `type-compatibility/tag-type-check`

### Target Resolution

- `target-resolution/valid-path-target`
- `target-resolution/valid-member-target`
- `target-resolution/no-unsupported-targeting`
- `target-resolution/no-member-target-on-object`

### Constraint Validation

- `constraint-validation/no-contradictions`
- `constraint-validation/no-duplicate-tags`
- `constraint-validation/no-description-tag`
- `constraint-validation/no-contradictory-rules`

### `.formspec.yml` Capability Rules

- `constraints-allowed-field-types`
- `constraints-allowed-layouts`

## Base Entry Point

Extension authors can use `@formspec/eslint-plugin/base` for `createConstraintRule(...)` and the shared JSDoc/type helpers used by the built-in rules.

## Rules

<!-- begin auto-generated rules list -->

🔧 Automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).

| Name                                                                                                                                                                               | Description                                                                                     | 🔧 |
| :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :- |
| [constraint-validation/no-contradictions](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/constraint-validation/no-contradictions.md)           | Reports contradictory FormSpec constraint combinations                                          |    |
| [constraint-validation/no-contradictory-rules](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/constraint-validation/no-contradictory-rules.md) | Reports contradictory FormSpec conditional rules on the same behavioral axis                    |    |
| [constraint-validation/no-description-tag](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/constraint-validation/no-description-tag.md)         | Bans @description, which is not a standard TSDoc tag                                            |    |
| [constraint-validation/no-duplicate-tags](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/constraint-validation/no-duplicate-tags.md)           | Reports duplicate FormSpec tags on the same field target                                        |    |
| [constraints-allowed-field-types](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/constraints-allowed-field-types.md)                           | Validates that field types are allowed by the project's constraints                             |    |
| [constraints-allowed-layouts](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/constraints-allowed-layouts.md)                                   | Validates that layout constructs (group, conditionals) are allowed by the project's constraints |    |
| [tag-recognition/no-disabled-tags](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/tag-recognition/no-disabled-tags.md)                         | Reports FormSpec tags disabled by project configuration                                         |    |
| [tag-recognition/no-markdown-formatting](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/tag-recognition/no-markdown-formatting.md)             | Forbids Markdown formatting in configured FormSpec tag values                                   | 🔧 |
| [tag-recognition/no-unknown-tags](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/tag-recognition/no-unknown-tags.md)                           | Reports FormSpec tags that are not part of the specification                                    |    |
| [tag-recognition/require-tag-arguments](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/tag-recognition/require-tag-arguments.md)               | Requires arguments for FormSpec tags that need values                                           |    |
| [target-resolution/no-member-target-on-object](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/target-resolution/no-member-target-on-object.md) | Disallows member-target syntax on non-string-literal-union fields                               |    |
| [target-resolution/no-unsupported-targeting](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/target-resolution/no-unsupported-targeting.md)     | Disallows path or member target syntax on tags that do not support it                           |    |
| [target-resolution/valid-member-target](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/target-resolution/valid-member-target.md)               | Validates member-target references against string literal union fields                          |    |
| [target-resolution/valid-path-target](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/target-resolution/valid-path-target.md)                   | Validates path-target references against the resolved field type                                |    |
| [type-compatibility/tag-type-check](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/type-compatibility/tag-type-check.md)                       | Ensures FormSpec tags are applied to compatible field types                                     |    |
| [value-parsing/valid-integer-value](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/value-parsing/valid-integer-value.md)                       | Validates integer-valued FormSpec tags                                                          |    |
| [value-parsing/valid-json-value](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/value-parsing/valid-json-value.md)                             | Validates JSON-valued FormSpec tags                                                             |    |
| [value-parsing/valid-numeric-value](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/value-parsing/valid-numeric-value.md)                       | Validates numeric-valued FormSpec tags                                                          |    |
| [value-parsing/valid-regex-pattern](https://github.com/mike-north/formspec/blob/main/packages/eslint-plugin/docs/rules/value-parsing/valid-regex-pattern.md)                       | Validates @pattern tag values as regular expressions                                            |    |

<!-- end auto-generated rules list -->

## Example

```ts
class Example {
  /** @minimum 0 */
  age!: number;

  /** @uniqueItems */
  tags!: string[];
}
```

The plugin validates tag names, argument syntax, target paths, and type compatibility before your build gets to static schema generation.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See the repository root `LICENSE` file for details.
