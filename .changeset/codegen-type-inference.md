---
"@formspec/cli": minor
---

Add type-safe schema inference to codegen output

The `formspec codegen` command now generates additional TypeScript types for improved developer experience:

**Generated Types:**
- Schema types (e.g., `UserFormSchema`) - Type-safe form data with exact literal types
- Element tuple types (e.g., `UserFormElements`) - Exact types for field arrays
- Typed accessor functions (e.g., `getUserFormFormSpec()`) - Type-safe FormSpec access

**Benefits:**
- Same level of type inference as Chain DSL
- Autocomplete for enum values and field names
- Compile-time checking of form data structure
- IDE support for navigating schema properties

**Usage:**
```typescript
import { UserFormSchema, getUserFormFormSpec } from './__formspec_types__';

// Type-safe form data with autocomplete
const data: UserFormSchema = {
  name: 'Alice',
  country: 'us',  // IDE shows valid options
};

// Type-safe spec access with literal types
const spec = getUserFormFormSpec();
spec.elements[0]._field  // Type: "text" (not string)
```

This brings decorator-based forms to feature parity with the Chain DSL for type safety.
