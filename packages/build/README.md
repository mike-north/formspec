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
  field.enum("subject", ["General", "Support", "Sales"])
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

### Canonical IR Pipeline

The build pipeline now flows through a Canonical Intermediate Representation (IR). When you call `buildFormSchemas()`, the form definition is first converted to IR, then the IR is compiled to JSON Schema and UI Schema:

```
FormSpec definition → Canonical IR → JSON Schema + UI Schema
```

This enables consistent processing regardless of whether forms are defined via the Chain DSL or analyzed from TypeScript source files.

### Generate from TypeScript Classes

Generate schemas from TypeScript class definitions using static analysis of JSDoc constraint tags:

```typescript
import { generateSchemasFromClass } from "@formspec/build";

const { jsonSchema, uiSchema } = generateSchemasFromClass({
  filePath: "./src/forms.ts",
  className: "UserForm",
});
```

The analyzer extracts type information and JSDoc constraint tags (e.g., `/** @Minimum 0 @Maximum 100 */`) from class properties to generate schemas.

### Entry Points

| Entry Point               | Audience           | Description                                                                                       |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `@formspec/build`         | Public API         | `buildFormSchemas`, `writeSchemas`, `generateSchemasFromClass`, schema generators                 |
| `@formspec/build/browser` | Browser (playground) | Schema generators without Node.js `fs`/`path` — safe for bundlers                              |
| `@formspec/build/internals` | CLI (unstable)   | Internal APIs: `createProgramContext`, `analyzeClass`, `generateClassSchemas`                     |

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

| Function                             | Description                                                        |
| ------------------------------------ | ------------------------------------------------------------------ |
| `buildFormSchemas(form)`             | Generate both JSON Schema and UI Schema                            |
| `generateJsonSchema(form)`           | Generate only JSON Schema                                          |
| `generateUiSchema(form)`             | Generate only UI Schema                                            |
| `writeSchemas(form, options)`        | Build and write schemas to disk                                    |
| `generateSchemasFromClass(options)`  | Generate schemas from a TypeScript class via static analysis       |
| `generateSchemas(options)`           | Generate schemas from a TypeScript type via static analysis        |

### Types

| Type                      | Description                             |
| ------------------------- | --------------------------------------- |
| `BuildResult`             | Return type of `buildFormSchemas`       |
| `WriteSchemasOptions`     | Options for `writeSchemas`              |
| `WriteSchemasResult`      | Return type of `writeSchemas`           |
| `JsonSchema2020`          | JSON Schema 2020-12 type                |
| `GenerateFromClassOptions` | Options for `generateSchemasFromClass` |
| `UISchema`                | JSON Forms UI Schema type               |

## License

UNLICENSED
