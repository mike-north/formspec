# @formspec/cli

## 0.1.0-alpha.3

### Minor Changes

- [#14](https://github.com/mike-north/formspec/pull/14) [`7d81c70`](https://github.com/mike-north/formspec/commit/7d81c708b90a41df9a75ea3b3b9da0ecf912ba6c) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/cli package for static TypeScript analysis and schema generation

  This new package provides a CLI tool that generates JSON Schema and JSON Forms UI Schema from TypeScript source files using a hybrid approach:

  **Static Analysis (TypeScript Compiler API):**
  - Extracts class fields with their TypeScript types
  - Parses decorator metadata (@Label, @Min, @Max, etc.)
  - Detects method parameters using `InferSchema<typeof X>` pattern
  - Converts TypeScript types to JSON Schema and FormSpec fields

  **Runtime Execution (Dynamic Import):**
  - Loads exported FormSpec constants (chain DSL) at runtime
  - Uses @formspec/build generators to produce schemas
  - Enables full FormSpec features for method parameters

  **Usage:**

  ```bash
  # Generate schemas from a class with decorators
  formspec generate ./src/forms.ts MyClass -o ./generated

  # Generate schemas from all FormSpec exports (chain DSL)
  formspec generate ./src/forms.ts -o ./generated
  ```

  **Output Structure:**

  ```
  generated/ClassName/
  ├── schema.json           # JSON Schema for class fields
  ├── ux_spec.json          # UI Schema
  ├── instance_methods/
  │   └── methodName/
  │       ├── params.schema.json
  │       ├── params.ux_spec.json
  │       └── return_type.schema.json
  └── static_methods/
      └── ...

  generated/formspecs/
  └── ExportName/
      ├── schema.json
      └── ux_spec.json
  ```

  This approach eliminates the need for type-hint decorators like `@Boolean()` since types are inferred directly from TypeScript.

- [#15](https://github.com/mike-north/formspec/pull/15) [`7b29657`](https://github.com/mike-north/formspec/commit/7b2965758ff04479cd0e1ad32866a35e4e86b6b4) Thanks [@mike-north](https://github.com/mike-north)! - Add type-safe schema inference to codegen output

  The `formspec codegen` command now generates additional TypeScript types for improved developer experience:

  **Generated Types:**
  - Schema types (e.g., `UserFormSchema`) - Represents the form **data structure** with exact literal types inferred from TypeScript
  - Element tuple types (e.g., `UserFormElements`) - Internal type representing the field array with exact literal types
  - Typed accessor functions (e.g., `getUserFormFormSpec()`) - Type-safe FormSpec access with full type information

  **Benefits:**
  - Same level of type inference as Chain DSL
  - Autocomplete for enum values and field names
  - Compile-time checking of form data structure
  - IDE support for navigating schema properties

  **Breaking Changes:**
  None. This is a purely additive change - existing codegen output remains valid.

  **Migration:**
  No migration required. Re-run `formspec codegen` to regenerate files with new types:

  ```bash
  formspec codegen ./src/forms.ts -o ./src/__formspec_types__.ts
  ```

  Then update your imports to use the new types:

  ```typescript
  // Before (still works)
  import "./__formspec_types__";
  import { toFormSpec } from "@formspec/decorators";
  const spec = toFormSpec(UserForm);

  // After (with type safety)
  import { getUserFormFormSpec, type UserFormSchema } from "./__formspec_types__";
  const spec = getUserFormFormSpec();
  ```

  **Usage Example:**

  ```typescript
  import { UserFormSchema, getUserFormFormSpec } from "./__formspec_types__";

  // Type-safe form data with autocomplete
  const data: UserFormSchema = {
    name: "Alice",
    country: "us", // IDE shows valid options: "us" | "ca"
  };

  // Type error caught at compile time
  const invalid: UserFormSchema = {
    name: "Bob",
    country: "invalid", // ❌ Error: Type '"invalid"' is not assignable
  };

  // Type-safe spec access with literal types
  const spec = getUserFormFormSpec();
  spec.elements[0]._field; // Type: "text" (literal, not string!)
  spec.elements[0].id; // Type: "name" (literal, enables type-safe field access)
  ```

  This brings decorator-based forms to feature parity with the Chain DSL for type safety.

### Patch Changes

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
