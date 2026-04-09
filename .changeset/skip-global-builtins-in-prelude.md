---
"@formspec/analysis": patch
---

Fix TS2300 "Duplicate identifier" when a TypeScript global built-in type (e.g. `Date`) is registered as an extension custom type. The synthetic prelude no longer emits `type X = unknown;` for types already declared in TypeScript's lib files, preventing spurious type errors that were misattributed to unrelated tag applications.
