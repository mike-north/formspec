# @formspec/cli

## 0.1.0-alpha.7

### Patch Changes

- Updated dependencies [[`5a73b5c`](https://github.com/mike-north/formspec/commit/5a73b5c5ba6e674008e48cf1e813a15ba5024f8f)]:
  - @formspec/build@0.1.0-alpha.7

## 0.1.0-alpha.6

### Patch Changes

- [#27](https://github.com/mike-north/formspec/pull/27) [`7b3d95d`](https://github.com/mike-north/formspec/commit/7b3d95d9b51664f7156bc753cfcd64d3bd3bda22) Thanks [@mike-north](https://github.com/mike-north)! - Improve DX based on second round of evaluation feedback

  **@formspec/cli:**
  - Improved error messages to distinguish between "compiled file missing" and "no FormSpec exports found"
  - Error messages now use `npx formspec` for users without CLI in PATH
  - Added documentation for `codegen` command
  - Added documentation explaining `ux_spec.json` vs JSON Forms `uiSchema` format

  **@formspec/dsl:**
  - Fixed type inference so fields inside `when()` conditionals are correctly typed as optional
  - Added `FlattenIntersection` utility type (exported)
  - Added `ExtractNonConditionalFields` and `ExtractConditionalFields` types with TSDoc examples

- Updated dependencies []:
  - @formspec/build@0.1.0-alpha.5

## 0.1.0-alpha.5

### Patch Changes

- [#22](https://github.com/mike-north/formspec/pull/22) [`a4b341d`](https://github.com/mike-north/formspec/commit/a4b341d42adaacf6f7e8fa79139575a41b181e84) Thanks [@mike-north](https://github.com/mike-north)! - Add DX improvements across FormSpec packages

  **P4-3: EnumOptions Record Shorthand**

  You can now use a more concise record format for `@EnumOptions`:

  ```typescript
  // New shorthand format
  @EnumOptions({ admin: "Administrator", user: "Regular User" })
  role!: "admin" | "user";

  // Equivalent to the existing array format
  @EnumOptions([
    { id: "admin", label: "Administrator" },
    { id: "user", label: "Regular User" }
  ])
  ```

  **P4-1: Auto-generate Enum Options from Union Types**

  When `@EnumOptions` is not present, options are now automatically generated with `{ id, label }` format where both values match the union member:

  ```typescript
  // Without @EnumOptions
  status!: "draft" | "published";
  // Auto-generates: [{ id: "draft", label: "draft" }, { id: "published", label: "published" }]
  ```

  These changes make it faster to define enum fields while maintaining full backward compatibility with the existing array format.

  **Additional DX Improvements**
  - **@formspec/dsl**: Duplicate field names are now reported as errors instead of warnings
  - **@formspec/build**: Fixed duplicate entries in JSON Schema `required` arrays
  - **@formspec/cli**: Added `--help` for subcommands, warn on unexported decorated classes
  - **@formspec/decorators**: Added `@Group` decorator support for UI schema grouping

- Updated dependencies [[`a4b341d`](https://github.com/mike-north/formspec/commit/a4b341d42adaacf6f7e8fa79139575a41b181e84)]:
  - @formspec/build@0.1.0-alpha.5

## 0.1.0-alpha.4

### Patch Changes

- [#18](https://github.com/mike-north/formspec/pull/18) [`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b) Thanks [@mike-north](https://github.com/mike-north)! - Add README.md documentation to all npm packages
  - Added comprehensive README.md files to formspec, @formspec/core, @formspec/build, and @formspec/runtime
  - Added ESM requirements section to all package READMEs
  - Updated package.json files to include README.md in published packages

  This addresses DX evaluation feedback that published packages lacked documentation,
  making it difficult for new users to get started.

- Updated dependencies [[`2ccf6d1`](https://github.com/mike-north/formspec/commit/2ccf6d1174f3e08f95822f0c7cb14c0ff66d569b), [`96f08ac`](https://github.com/mike-north/formspec/commit/96f08acc744ca1de8f8ca58be15e51844aba29e9)]:
  - @formspec/build@0.1.0-alpha.4

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
