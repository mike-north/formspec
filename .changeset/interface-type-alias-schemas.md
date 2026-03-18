---
"@formspec/build": minor
"@formspec/core": patch
"formspec": minor
---

Add interface and type alias schema generation with TSDoc tags

**@formspec/build:**

- New `generateSchemas()` unified entry point — auto-detects class, interface, or type alias
- Interface analysis: `@Field_displayName`, `@Field_description`, and constraint tags (`@Minimum`, `@Pattern`, etc.) extracted from TSDoc comments on interface properties
- Type alias analysis: object type literal aliases analyzed the same as interfaces
- Constrained primitive type aliases: `type Percent = number` with `@Minimum 0 @Maximum 100` propagates constraints to fields using that type
- `@EnumOptions` TSDoc tag with inline JSON: `@EnumOptions ["a","b","c"]`
- Nested constraint propagation works across classes, interfaces, and type aliases
- `analyzeTypeAlias()` returns error results with line numbers instead of throwing
- Generic `findNodeByName<T>` helper consolidates finder functions

**@formspec/core:**

- Added `EnumOptions: "json"` to `CONSTRAINT_TAG_DEFINITIONS`
