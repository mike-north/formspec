# @formspec/constraints

Constraint configuration and validation for FormSpec DSL usage.

Use this package when you want project-level rules such as:

- disallowing certain field types
- limiting layout nesting
- restricting selected field options
- validating `.formspec.yml`-driven capability policies

## Install

```bash
pnpm add @formspec/constraints
```

## `.formspec.yml`

```yaml
constraints:
  fieldTypes:
    dynamicEnum: warn
    dynamicSchema: error

  layout:
    conditionals: off
    maxNestingDepth: 2

  fieldOptions:
    placeholder: off
    minItems: warn
```

## Programmatic Use

```ts
import { loadConfig, mergeWithDefaults, validateFormSpecElements } from "@formspec/constraints";
import { field, formspec } from "@formspec/dsl";

const { config } = await loadConfig();
const resolved = mergeWithDefaults(config.constraints);

const form = formspec(field.text("name"), field.dynamicEnum("country", "countries"));
const result = validateFormSpecElements(form.elements, { constraints: resolved });
```

## Browser Entry Point

Use `@formspec/constraints/browser` when you need validation in browser code and do not want the file-based config loader:

```ts
import { loadConfigFromString, validateFormSpec } from "@formspec/constraints/browser";
```

## Main Exports

- `loadConfig`
- `loadConfigFromString`
- `defineConstraints`
- `mergeWithDefaults`
- `validateFormSpecElements`
- `validateFormSpec`

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.
