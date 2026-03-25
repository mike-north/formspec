# @formspec/validator

JSON Schema validation for FormSpec, powered by [@cfworker/json-schema](https://github.com/nicolo-ribaudo/cfworker-json-schema). Designed for secure runtime environments that prohibit `new Function()` and `eval()`.

## Installation

```bash
npm install @formspec/validator
# or
pnpm add @formspec/validator
```

## Requirements

This package is ESM-only and requires:

```json
// package.json
{
  "type": "module"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Quick Start

```typescript
import { createFormSpecValidator } from "@formspec/validator";
import { buildFormSchemas, formspec, field } from "formspec";

const form = formspec(field.text("name", { required: true }), field.number("age", { min: 0 }));

const { jsonSchema } = buildFormSchemas(form);

// Create a validator that ignores x-formspec-* extension keywords
const validator = createFormSpecValidator(jsonSchema);

const result = validator.validate({ name: "Alice", age: 30 });
console.log(result.valid); // true
```

## Why This Package?

Standard JSON Schema validators like Ajv use `new Function()` internally, which is blocked in:

- Cloudflare Workers
- Deno Deploy
- Browser extensions (CSP restrictions)
- Any environment with strict Content Security Policy

`@formspec/validator` wraps `@cfworker/json-schema`, which implements JSON Schema validation without code generation. It also pre-configures the validator to silently ignore `x-formspec-*` vendor extension keywords that FormSpec adds to generated schemas.

## API Reference

### Functions

| Function                                    | Description                                   |
| ------------------------------------------- | --------------------------------------------- |
| `createFormSpecValidator(schema, options?)` | Create a validator instance for a JSON Schema |

### Options

```typescript
interface CreateValidatorOptions {
  draft?: SchemaDraft; // JSON Schema draft version (default: "2020-12")
  shortCircuit?: boolean; // Stop on first error (default: true)
}
```

### Re-exports

This package re-exports key types from `@cfworker/json-schema`:

| Export             | Description                          |
| ------------------ | ------------------------------------ |
| `Validator`        | The validator class                  |
| `ValidationResult` | Result of `validator.validate()`     |
| `OutputUnit`       | Individual validation error detail   |
| `SchemaDraft`      | Supported JSON Schema draft versions |

## License

UNLICENSED
