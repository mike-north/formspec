---
"@formspec/validator": minor
---

Add @formspec/validator package — JSON Schema validator backed by @cfworker/json-schema, safe for secure runtimes that disallow `new Function()` (e.g., Cloudflare Workers). Replaces `@formspec/ajv-vocab` which required vocabulary registration for extension keywords. The new validator silently ignores `x-formspec-*` keywords with no setup needed.
