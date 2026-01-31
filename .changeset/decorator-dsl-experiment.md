---
"@formspec/exp-decorators": minor
---

Add experimental decorator-based FormSpec DSL

This experiment explores an alternative way to define forms using TypeScript class decorators (TC39 Stage 3). Instead of the builder pattern, you can annotate class properties:

```typescript
import { FormClass, Label, Optional, EnumOptions } from "@formspec/exp-decorators";

@FormClass()
class InvoiceForm {
  @Label("Customer Name")
  name: string;

  @Label("Amount")
  @Min(0)
  amount: number;

  @Label("Status")
  @EnumOptions(["draft", "sent", "paid"])
  status: "draft" | "sent" | "paid";

  @Label("Notes")
  @Optional()
  notes?: string;
}

const form = toFormSpec(InvoiceForm);
```

Key features:
- Property types define the schema shape
- Decorators add form metadata (labels, validation, etc.)
- All fields required by default; use `@Optional()` to allow empty
- TypeScript `?` indicates data shape, not form validation
- Supports groups via `@Group("name")` and conditionals via `@ShowWhen(predicate)`
