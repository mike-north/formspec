---
"@formspec/decorators": minor
"@formspec/dsl": minor
"@formspec/build": patch
"@formspec/cli": patch
---

Add DX improvements across FormSpec packages

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
