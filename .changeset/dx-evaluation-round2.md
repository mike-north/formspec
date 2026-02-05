---
"@formspec/cli": patch
"@formspec/dsl": patch
---

Improve DX based on second round of evaluation feedback

**@formspec/cli:**
- Improved error messages to distinguish between "compiled file missing" and "no FormSpec exports found"
- Error messages now use `npx formspec` for users without CLI in PATH
- Added documentation for `codegen` command
- Added documentation explaining `ux_spec.json` vs JSON Forms `uiSchema` format

**@formspec/dsl:**
- Fixed type inference so fields inside `when()` conditionals are correctly typed as optional
- Added `FlattenIntersection` utility type (exported)
- Added `ExtractNonConditionalFields` and `ExtractConditionalFields` types with TSDoc examples
