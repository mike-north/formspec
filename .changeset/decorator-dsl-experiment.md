---
"@formspec/decorators": minor
---

Add decorator-based FormSpec DSL

This provides an alternative way to define forms using TypeScript class decorators. Instead of the builder pattern, you can annotate class properties:

```typescript
import { Label, Min, EnumOptions, toFormSpec } from "@formspec/decorators";

class InvoiceForm {
  @Label("Customer Name")
  name!: string;

  @Label("Amount")
  @Min(0)
  amount!: number;

  @Label("Status")
  @EnumOptions(["draft", "sent", "paid"])
  status!: "draft" | "sent" | "paid";

  @Label("Archived")
  archived?: boolean;

  @Label("Notes")
  notes?: string;
}

// Use CLI codegen for runtime access:
// formspec codegen ./forms.ts -o ./__formspec_types__.ts
```

Key features:
- Property types define the schema shape
- Decorators add form metadata (labels, validation, etc.)
- TypeScript `?` indicates optional fields
- Use `@formspec/cli` codegen for runtime schema access
- Supports groups via `@Group("name")` and conditionals via `@ShowWhen(predicate)`
