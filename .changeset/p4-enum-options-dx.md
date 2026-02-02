---
"@formspec/decorators": minor
---

Add DX improvements for enum field options

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
