# FormSpec

Type-safe form definitions that compile to JSON Schema 2020-12 and JSON Forms UI Schema.

| TypeScript CI row             | Status                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 5.x                | [![TS 5.x](https://img.shields.io/github/check-runs/mike-north/formspec/main?nameFilter=Test%20%28TypeScript%205.x%29&label=TS%205.x&style=flat-square)](https://github.com/mike-north/formspec/actions/workflows/ci.yml?query=branch%3Amain)                             |
| TypeScript latest             | [![TS latest](https://img.shields.io/github/check-runs/mike-north/formspec/main?nameFilter=Test%20%28TypeScript%20latest%29&label=TS%20latest&style=flat-square)](https://github.com/mike-north/formspec/actions/workflows/ci.yml?query=branch%3Amain)                    |
| TypeScript beta               | [![TS beta](https://img.shields.io/github/check-runs/mike-north/formspec/main?nameFilter=Test%20%28TypeScript%20beta%29&label=TS%20beta&style=flat-square)](https://github.com/mike-north/formspec/actions/workflows/ci.yml?query=branch%3Amain)                          |
| TypeScript 6.x nightly        | [![TS 6.x nightly](https://img.shields.io/github/check-runs/mike-north/formspec/main?nameFilter=Test%20%28TypeScript%206.x%20nightly%29&label=TS%206.x%20nightly&style=flat-square)](https://github.com/mike-north/formspec/actions/workflows/ci.yml?query=branch%3Amain) |
| TypeScript 7.0 native preview | [![TS 7 tsgo](https://img.shields.io/github/check-runs/mike-north/formspec/main?nameFilter=Test%20%28TypeScript%207.0%20native%20preview%29&label=TS%207%20tsgo&style=flat-square)](https://github.com/mike-north/formspec/actions/workflows/ci.yml?query=branch%3Amain)  |

> **Architecture orientation.** New contributors and AI agents should read [`BOUNDED_CONTEXTS.md`](./BOUNDED_CONTEXTS.md) (a tour of the project's bounded contexts and how they relate) and [`GLOSSARY.md`](./GLOSSARY.md) (the project's vocabulary). The formal model lives in [`formspec.cml`](./formspec.cml).

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

## TypeScript Support

Packages that expose or consume the TypeScript compiler API currently support TypeScript `>=5.7.3 <7`. The per-PR CI workflow runs the main build, tests, lint, and typecheck against the workspace TypeScript version, plus non-blocking compatibility rows for other supported majors and pre-release tracks.

TypeScript 7 is covered separately through a non-blocking `tsgo` native-preview CI row using `@typescript/native-preview@beta`. TS 7 is experimental coverage, not an official supported major yet.

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
import { generateSchemas, generateSchemasBatch } from "@formspec/build";

const { jsonSchema, uiSchema } = generateSchemas({
  filePath: "./src/forms.ts",
  typeName: "UserRegistration",
  errorReporting: "throw",
});

const diagnostics = generateSchemas({
  filePath: "./src/forms.ts",
  typeName: "UserRegistration",
  errorReporting: "diagnostics",
});

const batch = generateSchemasBatch({
  targets: [
    { filePath: "./src/forms.ts", typeName: "UserRegistration" },
    { filePath: "./src/forms.ts", typeName: "BillingAddress" },
  ],
});
```

For invalid static-analysis inputs, `generateSchemas({ ..., errorReporting: "throw" })` throws with stable diagnostic codes embedded in the error message. In particular, `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` and `SYNTHETIC_SETUP_FAILURE` indicate extension setup problems, while `TYPE_MISMATCH` indicates an incompatible tag application in author source.

Use `generateSchemas({ ..., errorReporting: "diagnostics" })` when you want structured diagnostics instead of exceptions for a single target, and `generateSchemasBatch()` when you want to accumulate feedback across many targets in one pass. The older `generateSchemasDetailed()` compatibility wrapper is deprecated.

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

- `x-formspec-option-source`
- `x-formspec-option-source-params`
- `x-formspec-deprecation-description`

The default vendor prefix is `x-formspec`. `@formspec/build` also supports custom vendor prefixes for extension-generated JSON Schema keywords.

## Custom Annotation Inheritance

Extension-defined annotations can opt in to type-level semantic inheritance. Use `inheritFromBase: "local-wins"` when a derived class, interface, or named type-alias entry point should inherit the annotation from its base chain only if it does not declare the same extension annotation locally.

```ts
import { defineAnnotation, defineExtension } from "@formspec/core";

const displayCurrency = defineAnnotation({
  annotationName: "DisplayCurrency",
  inheritFromBase: "local-wins",
});

export const currencyExtension = defineExtension({
  extensionId: "x-example/currency",
  annotations: [displayCurrency],
});
```

`inheritFromBase` is semantic inheritance only. It controls how FormSpec analysis composes annotation IR across declaration heritage; it does not make the annotation serialize to JSON Schema. Schema emission remains controlled by the optional existing `toJsonSchema` hook, so inheritance and serialization are separate concerns. Property-level annotation inheritance and metadata-slot inheritance are out of scope.

## Package Guide

| Package                     | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `formspec`                  | Umbrella package re-exporting the common `core`, `dsl`, `build`, and `runtime` APIs |
| `@formspec/core`            | Shared types, IR nodes, and extension registration APIs                             |
| `@formspec/dsl`             | Chain DSL authoring surface                                                         |
| `@formspec/build`           | JSON Schema / UI Schema generation and static TypeScript analysis                   |
| `@formspec/runtime`         | Resolver helpers for dynamic data                                                   |
| `@formspec/analysis`        | Shared semantic-analysis protocol types and comment-tag utilities                   |
| `@formspec/dsl-policy`      | Private internal DSL-policy types, defaults, and validators                         |
| `@formspec/config`          | `formspec.config.ts` loading and DSL-policy compatibility re-exports                |
| `@formspec/validator`       | Runtime JSON Schema validation for secure environments                              |
| `@formspec/eslint-plugin`   | ESLint rules for FormSpec tags and DSL usage                                        |
| `@formspec/ts-plugin`       | TypeScript language-service plugin and reusable semantic service                    |
| `@formspec/language-server` | Completion, hover, and definition support for FormSpec tags                         |
| `@formspec/cli`             | Build-time CLI for schema and IR generation                                         |

## Published Packages

| Package                     | npm                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formspec`                  | [![NPM](https://nodei.co/npm/formspec.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/formspec/)                                   |
| `@formspec/core`            | [![NPM](https://nodei.co/npm/@formspec/core.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/core/)                       |
| `@formspec/dsl`             | [![NPM](https://nodei.co/npm/@formspec/dsl.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/dsl/)                         |
| `@formspec/build`           | [![NPM](https://nodei.co/npm/@formspec/build.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/build/)                     |
| `@formspec/runtime`         | [![NPM](https://nodei.co/npm/@formspec/runtime.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/runtime/)                 |
| `@formspec/analysis`        | [![NPM](https://nodei.co/npm/@formspec/analysis.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/analysis/)               |
| `@formspec/config`          | [![NPM](https://nodei.co/npm/@formspec/config.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/config/)                   |
| `@formspec/validator`       | [![NPM](https://nodei.co/npm/@formspec/validator.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/validator/)             |
| `@formspec/eslint-plugin`   | [![NPM](https://nodei.co/npm/@formspec/eslint-plugin.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/eslint-plugin/)     |
| `@formspec/ts-plugin`       | [![NPM](https://nodei.co/npm/@formspec/ts-plugin.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/ts-plugin/)             |
| `@formspec/language-server` | [![NPM](https://nodei.co/npm/@formspec/language-server.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/language-server/) |
| `@formspec/cli`             | [![NPM](https://nodei.co/npm/@formspec/cli.svg?style=flat-square&data=n,v,u,d&color=brightgreen)](https://nodei.co/npm/@formspec/cli/)                         |

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
