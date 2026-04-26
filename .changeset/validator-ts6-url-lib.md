---
"@formspec/validator": patch
---

Add `DOM` to the validator's build `lib` so the global `URL` type referenced by `@cfworker/json-schema`'s published declarations resolves under TypeScript 6.x. No runtime impact — declaration-emit only.
