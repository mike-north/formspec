# @formspec/runtime

Runtime helpers for dynamic FormSpec data sources.

## Install

```bash
pnpm add @formspec/runtime
```

Or use:

```bash
pnpm add formspec
```

## Main API

`defineResolvers(form, resolvers)` creates a typed resolver registry for the dynamic enum sources used by a form.

```ts
import { field, formspec } from "@formspec/dsl";
import { defineResolvers } from "@formspec/runtime";

const Form = formspec(
  field.dynamicEnum("country", "countries"),
  field.dynamicEnum("state", "states")
);

const resolvers = defineResolvers(Form, {
  countries: async () => ({
    options: [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
    ],
    validity: "valid",
  }),
  states: async () => ({
    options: [],
    validity: "unknown",
  }),
});

const countries = await resolvers.get("countries")();
```

## License

UNLICENSED
