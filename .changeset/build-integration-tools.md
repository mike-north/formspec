---
"formspec": minor
"@formspec/build": minor
---

Add build integration tools for schema generation

New `writeSchemas()` function and CLI tool make it easy to generate JSON Schema and UI Schema files as part of your build process.

### New exports

**Functions:**
- `writeSchemas(form, options)` - Build and write schemas to disk

**Types:**
- `WriteSchemasOptions` - Configuration for schema file output
- `WriteSchemasResult` - Paths to generated schema files

**CLI:**
- `formspec-build` command for generating schemas from form definition files

### Documentation improvements

- Removed unnecessary `as const` from all `field.enum()` examples
- Updated JSDoc to clarify that `field.enum()` automatically preserves literal types
- Added comprehensive "Build Integration" section to README
