# @formspec/build

Build tools to compile FormSpec forms into JSON Schema and JSON Forms UI Schema.

## Installation

```bash
npm install @formspec/build
# or
pnpm add @formspec/build
```

> **Note:** Most users should install the `formspec` umbrella package instead, which re-exports everything from this package.

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

## Usage

### Generate Schemas in Memory

```typescript
import { buildFormSchemas } from "@formspec/build";
import { formspec, field, group } from "@formspec/dsl";

const ContactForm = formspec(
  field.text("name", { label: "Name", required: true }),
  field.text("email", { label: "Email", required: true }),
  field.enum("subject", ["General", "Support", "Sales"]),
);

const { jsonSchema, uiSchema } = buildFormSchemas(ContactForm);

// Use with JSON Forms renderer
// <JsonForms schema={jsonSchema} uischema={uiSchema} data={formData} />
```

### Write Schemas to Disk

```typescript
import { writeSchemas } from "@formspec/build";

const result = writeSchemas(ContactForm, {
  outDir: "./generated",
  name: "contact-form",
  indent: 2,
});

console.log(`JSON Schema: ${result.jsonSchemaPath}`);
console.log(`UI Schema: ${result.uiSchemaPath}`);
// JSON Schema: ./generated/contact-form-schema.json
// UI Schema: ./generated/contact-form-uischema.json
```

### Use Individual Generators

```typescript
import { generateJsonSchema, generateUiSchema } from "@formspec/build";

const jsonSchema = generateJsonSchema(ContactForm);
const uiSchema = generateUiSchema(ContactForm);
```

## Generated Output

### JSON Schema (Draft-07)

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": { "type": "string", "title": "Name" },
    "email": { "type": "string", "title": "Email" },
    "subject": {
      "type": "string",
      "enum": ["General", "Support", "Sales"]
    }
  },
  "required": ["name", "email"]
}
```

### JSON Forms UI Schema

```json
{
  "type": "VerticalLayout",
  "elements": [
    { "type": "Control", "scope": "#/properties/name", "label": "Name" },
    { "type": "Control", "scope": "#/properties/email", "label": "Email" },
    { "type": "Control", "scope": "#/properties/subject" }
  ]
}
```

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `buildFormSchemas(form)` | Generate both JSON Schema and UI Schema |
| `generateJsonSchema(form)` | Generate only JSON Schema |
| `generateUiSchema(form)` | Generate only UI Schema |
| `writeSchemas(form, options)` | Build and write schemas to disk |

### Types

| Type | Description |
|------|-------------|
| `BuildResult` | Return type of `buildFormSchemas` |
| `WriteSchemasOptions` | Options for `writeSchemas` |
| `WriteSchemasResult` | Return type of `writeSchemas` |
| `JSONSchema7` | JSON Schema Draft-07 type |
| `UISchema` | JSON Forms UI Schema type |

## License

UNLICENSED
