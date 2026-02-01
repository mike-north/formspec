---
"@formspec/decorators": minor
"@formspec/cli": patch
---

Add @formspec/decorators package and improve CLI developer experience

**New Package: @formspec/decorators**
- Provides all decorator stubs for FormSpec CLI static analysis
- Zero runtime overhead - decorators are no-ops
- Eliminates need to copy-paste decorator stubs manually

**CLI Improvements:**
- Updated README with example output showing generated JSON
- Simplified decorator setup: just `npm install @formspec/decorators`
- Nested object types now include `fields` array in UI Schema for form rendering
- Clarified that `emitDecoratorMetadata` is not required
