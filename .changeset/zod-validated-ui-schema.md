---
"@formspec/build": minor
"formspec": minor
---

Unify UI Schema output: both chain DSL and decorator DSL now produce JSON Forms-compliant UI Schema, validated at generation time via Zod schemas.

**Breaking:** `ClassSchemas.uiSchema` and `GenerateFromClassResult.uiSchema` changed from `{ elements: FormSpecField[] }` to `UISchema` (a JSON Forms VerticalLayout with Controls, Groups, and rules). Consumers accessing `.uiSchema.elements[n]._field` or `.uiSchema.elements[n].id` must update to use the JSON Forms structure (`.uiSchema.elements[n].scope`, `.uiSchema.elements[n].type`).

New exports: `generateUiSchemaFromFields()`, Zod validation schemas (`uiSchemaSchema`, `jsonSchema7Schema`, `controlSchema`, `ruleSchema`, etc.), and types (`Categorization`, `Category`, `LabelElement`).
