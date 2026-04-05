# FormSpec

Type-safe form definitions that compile to JSON Schema 2020-12 and JSON Forms UI Schema.

## What It Covers

FormSpec supports two authoring styles:

- Chain DSL for programmatic form definitions
- Static analysis of TypeScript classes, interfaces, and type aliases annotated with TSDoc tags

Both paths compile into the same canonical IR before JSON Schema and UI Schema generation.

## Install

```bash
pnpm add formspec
```

Use the umbrella package when you want the common runtime-facing APIs in one import. Tooling packages such as the CLI, ESLint plugin, and language server are published separately.

## Quick Start

### Chain DSL

```ts
import { buildFormSchemas, field, formspec, group, is, when } from "formspec";
import type { InferFormSchema } from "formspec";

const ContactForm = formspec(
  group(
    "Contact",
    field.text("name", { label: "Name", required: true }),
    field.text("email", { label: "Email", required: true })
  ),
  field.enum("preferredChannel", ["email", "phone"] as const, {
    label: "Preferred Channel",
    required: true,
  }),
  when(is("preferredChannel", "phone"), field.text("phoneNumber", { label: "Phone Number" }))
);

type ContactData = InferFormSchema<typeof ContactForm>;

const { jsonSchema, uiSchema } = buildFormSchemas(ContactForm);
```

### Runtime Resolvers

```ts
import { defineResolvers, field, formspec } from "formspec";

const Form = formspec(field.dynamicEnum("country", "countries", { label: "Country" }));

const resolvers = defineResolvers(Form, {
  countries: async () => ({
    options: [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
    ],
    validity: "valid",
  }),
});
```

### Static Type Analysis

Static schema generation lives in `@formspec/build` and `@formspec/cli`.

```ts
import { generateSchemas } from "@formspec/build";

const { jsonSchema, uiSchema } = generateSchemas({
  filePath: "./src/forms.ts",
  typeName: "UserRegistration",
});
```

```ts
export interface UserRegistration {
  /** @displayName Full Name @minLength 1 */
  name: string;

  /** @format email */
  email: string;

  /** @minimum 18 @maximum 120 */
  age?: number;
}
```

## Generated Schema Extensions

Generated schemas may include vendor keywords such as:

- `x-formspec-source`
- `x-formspec-params`
- `x-formspec-deprecation-description`

The default vendor prefix is `x-formspec`. `@formspec/build` also supports custom vendor prefixes for extension-generated JSON Schema keywords.

## Package Guide

| Package                     | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `formspec`                  | Umbrella package re-exporting the common `core`, `dsl`, `build`, and `runtime` APIs |
| `@formspec/core`            | Shared types, IR nodes, and extension registration APIs                             |
| `@formspec/dsl`             | Chain DSL authoring surface                                                         |
| `@formspec/build`           | JSON Schema / UI Schema generation and static TypeScript analysis                   |
| `@formspec/runtime`         | Resolver helpers for dynamic data                                                   |
| `@formspec/analysis`        | Shared semantic-analysis protocol types and comment-tag utilities                    |
| `@formspec/constraints`     | `.formspec.yml` configuration and DSL capability validation                         |
| `@formspec/validator`       | Runtime JSON Schema validation for secure environments                              |
| `@formspec/eslint-plugin`   | ESLint rules for FormSpec tags and DSL usage                                        |
| `@formspec/ts-plugin`       | TypeScript language-service plugin and reusable semantic service                    |
| `@formspec/language-server` | Completion, hover, and definition support for FormSpec tags                         |
| `@formspec/cli`             | Build-time CLI for schema and IR generation                                         |
| `@formspec/playground`      | Private monorepo playground app                                                     |

## Monorepo Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
```

The root build runs packages in dependency order, and package-local test scripts handle any required prebuild steps.

## License

MIT. The FormSpec monorepo and its packages are released under the MIT License. See [LICENSE](./LICENSE) for details.
