# @formspec/validator

Runtime JSON Schema validation for FormSpec, backed by `@cfworker/json-schema`.

This package is intended for environments where code-generating validators are a bad fit, including workers and CSP-restricted runtimes.

## Install

```bash
pnpm add @formspec/validator
```

## Usage

```ts
import { createFormSpecValidator } from "@formspec/validator";

const validator = createFormSpecValidator({
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    country: { type: "string", "x-formspec-source": "countries" },
  },
});

const result = validator.validate({ name: "Alice", country: "us" });
void result;
```

Unknown `x-formspec-*` keywords are ignored by the underlying validator, so generated schemas work without extra vocabulary registration.

## Main Exports

- `createFormSpecValidator(schema, options?)`
- `Validator`
- `ValidationResult`
- `OutputUnit`
- `SchemaDraft`

## License

UNLICENSED
