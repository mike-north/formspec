---
"@formspec/transformer": minor
"@formspec/decorators": minor
---

Add @formspec/transformer package for runtime type metadata

**New Package: @formspec/transformer**
- TypeScript transformer that emits type metadata at compile time
- Enables runtime access to full TypeScript type information
- Works with ts-patch for seamless TypeScript compilation

**Updated: @formspec/decorators**
- Decorators now store metadata at runtime (instead of being no-ops)
- Added `toFormSpec()` function to generate FormSpec at runtime
- Added `getDecoratorMetadata()` and `getTypeMetadata()` helper functions
- New types: `TypeMetadata`, `FieldDecoratorMetadata`, `FormSpecField`, `FormSpecOutput`

**Usage:**
```typescript
import { Label, toFormSpec } from "@formspec/decorators";

class MyForm {
  @Label("Name")
  name!: string;

  @Label("Country")
  country!: "us" | "ca";
}

// With transformer, get spec at runtime:
const spec = toFormSpec(MyForm);
```
