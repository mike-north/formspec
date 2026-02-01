# @formspec/decorators

## 0.1.0-alpha.3

### Minor Changes

- [#9](https://github.com/mike-north/formspec/pull/9) [`c2184f0`](https://github.com/mike-north/formspec/commit/c2184f0aaa2271cee45500d7b403303b6bd79d01) Thanks [@mike-north](https://github.com/mike-north)! - Add decorator-based FormSpec DSL

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

- [#14](https://github.com/mike-north/formspec/pull/14) [`7d81c70`](https://github.com/mike-north/formspec/commit/7d81c708b90a41df9a75ea3b3b9da0ecf912ba6c) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/decorators package and improve CLI developer experience

  **New Package: @formspec/decorators**
  - Provides all decorator stubs for FormSpec CLI static analysis
  - Zero runtime overhead - decorators are no-ops
  - Eliminates need to copy-paste decorator stubs manually

  **CLI Improvements:**
  - Updated README with example output showing generated JSON
  - Simplified decorator setup: just `npm install @formspec/decorators`
  - Nested object types now include `fields` array in UI Schema for form rendering
  - Clarified that `emitDecoratorMetadata` is not required
