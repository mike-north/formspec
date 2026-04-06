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

Static analysis also supports declaration-level discriminator specialization for generic object-like types:

```ts
/** @discriminator :kind T */
export interface TaggedValue<T> {
  kind: string;
  id: string;
}

/** @apiName customer */
export interface CustomerKind {
  id: string;
}
```

When `TaggedValue<CustomerKind>` is analyzed, the generated JSON Schema keeps the ordinary object shape and specializes only `kind` to `enum: ["customer"]`.

## Metadata Configuration

FormSpec treats logical names, JSON-facing names, and human-facing labels as separate concepts:

- logical identity: the field or type name in TypeScript and IR
- `apiName`: the serialized JSON-facing name
- `displayName`: the human-facing label or title

By default, inference is disabled. Existing field and type names are preserved unless you provide explicit metadata or opt into inference with a metadata policy.

In the Chain DSL, `label` is a backward-compatible alias for `displayName`. They mean the same thing, and a field config should use one or the other, not both.

### Build-Time Metadata Policy

Static generation APIs in `@formspec/build` accept a `metadata` option. Use it to require explicit names, infer missing names, and configure pluralization/inflection for type-level names.

```ts
import { generateSchemas, type MetadataPolicyInput } from "@formspec/build";

const startCase = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const toSnakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

const pluralize = (value: string) => (value.endsWith("s") ? value : `${value}s`);

const metadata: MetadataPolicyInput = {
  field: {
    apiName: { mode: "require-explicit" },
    displayName: {
      mode: "infer-if-missing",
      infer: ({ logicalName }) => startCase(logicalName),
    },
  },
  type: {
    apiName: {
      mode: "infer-if-missing",
      infer: ({ logicalName }) => toSnakeCase(logicalName),
      pluralization: {
        mode: "infer-if-missing",
        inflect: ({ singular }) => pluralize(singular),
      },
    },
    displayName: {
      mode: "infer-if-missing",
      infer: ({ logicalName }) => startCase(logicalName),
      pluralization: {
        mode: "infer-if-missing",
        inflect: ({ singular }) => pluralize(singular),
      },
    },
  },
};

const { jsonSchema, uiSchema } = generateSchemas({
  filePath: "./src/forms.ts",
  typeName: "UserRegistration",
  metadata,
});
```

Inference callbacks receive contextual information such as:

- `surface`: `"tsdoc"` or `"chain-dsl"`
- `declarationKind`: `"type"`, `"field"`, or `"method"`
- `logicalName`: the pre-serialization identifier

Pluralization callbacks additionally receive the resolved singular value as `singular`.

### Configured Chain DSL Factories

Use `createFormSpecFactory()` from `@formspec/dsl` when you want one metadata policy to drive both authoring-time types and schema generation for DSL-authored forms.

```ts
import { createFormSpecFactory } from "@formspec/dsl";

const toSnakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

const startCase = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const { field, formspec } = createFormSpecFactory({
  metadata: {
    field: {
      apiName: { mode: "require-explicit" },
      displayName: {
        mode: "infer-if-missing",
        infer: ({ logicalName }) => startCase(logicalName),
      },
    },
    type: {
      apiName: {
        mode: "infer-if-missing",
        infer: ({ logicalName }) => toSnakeCase(logicalName),
      },
    },
  },
});

const ContactForm = formspec(
  field.text("firstName", {
    apiName: "first_name",
    required: true,
  }),
  field.text("lastName", {
    apiName: "last_name",
    displayName: "Surname",
  })
);
```

When a policy uses `mode: "require-explicit"`, the configured field builders reflect that at compile time. In the example above, omitting `apiName` from a field config is a type error.

Equivalent metadata can also be expressed on the TSDoc surface:

```ts
interface ContactForm {
  /** @apiName first_name @displayName First Name */
  firstName: string;
}
```

The intended model is the same across both surfaces. The difference is authoring syntax, not naming semantics.

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

MIT. The FormSpec monorepo source is released under the MIT License. See the repository root [LICENSE](./LICENSE) for details.
