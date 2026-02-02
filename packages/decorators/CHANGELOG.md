# @formspec/decorators

## 0.1.0-alpha.4

### Minor Changes

- [#19](https://github.com/mike-north/formspec/pull/19) [`98beb0a`](https://github.com/mike-north/formspec/commit/98beb0a59bd6ec792240f1135897274a45391148) Thanks [@mike-north](https://github.com/mike-north)! - Add runtime warning when decorated classes are used without type metadata

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

### Patch Changes

- [#18](https://github.com/mike-north/formspec/pull/18) [`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b) Thanks [@mike-north](https://github.com/mike-north)! - Add README.md documentation to all npm packages
  - Added comprehensive README.md files to formspec, @formspec/core, @formspec/build, and @formspec/runtime
  - Added ESM requirements section to all package READMEs
  - Updated package.json files to include README.md in published packages

  This addresses DX evaluation feedback that published packages lacked documentation,
  making it difficult for new users to get started.

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
