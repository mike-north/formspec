---
"@formspec/cli": minor
---

Add type-safe schema inference to codegen output

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
import './__formspec_types__';
import { toFormSpec } from '@formspec/decorators';
const spec = toFormSpec(UserForm);

// After (with type safety)
import { getUserFormFormSpec, type UserFormSchema } from './__formspec_types__';
const spec = getUserFormFormSpec();
```

**Usage Example:**
```typescript
import { UserFormSchema, getUserFormFormSpec } from './__formspec_types__';

// Type-safe form data with autocomplete
const data: UserFormSchema = {
  name: 'Alice',
  country: 'us',  // IDE shows valid options: "us" | "ca"
};

// Type error caught at compile time
const invalid: UserFormSchema = {
  name: 'Bob',
  country: 'invalid',  // ❌ Error: Type '"invalid"' is not assignable
};

// Type-safe spec access with literal types
const spec = getUserFormFormSpec();
spec.elements[0]._field  // Type: "text" (literal, not string!)
spec.elements[0].id      // Type: "name" (literal, enables type-safe field access)
```

This brings decorator-based forms to feature parity with the Chain DSL for type safety.
