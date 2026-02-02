---
"@formspec/decorators": minor
---

Add runtime warning when decorated classes are used without type metadata

When `toFormSpec()` or `buildFormSchemas()` is called on a decorated class
without running `formspec codegen` first, the function now emits a warning:

```
[FormSpec] Warning: toFormSpec(MyForm) called without type metadata.
  - All fields will default to type "text"
  - All fields will be marked as required
  - Enum options from TypeScript types will not be available

  To fix this, run: formspec codegen <your-file.ts> -o ./__formspec_types__.ts
  Then import the generated file BEFORE calling toFormSpec():

    import './__formspec_types__';
    import { toFormSpec } from '@formspec/decorators';
    const schemas = toFormSpec(MyForm);
```

This addresses DX evaluation feedback that silent degradation (all fields becoming
"text", all fields becoming required) was confusing and led to subtle bugs.

The warning:
- Only appears once per class (prevents duplicate warnings)
- Only appears for decorated classes (classes without decorators are not warned)
- Includes actionable instructions for fixing the issue
