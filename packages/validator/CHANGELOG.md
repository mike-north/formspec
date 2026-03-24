# @formspec/validator

## 0.1.0-alpha.12

### Minor Changes

- [#64](https://github.com/mike-north/formspec/pull/64) [`42303a2`](https://github.com/mike-north/formspec/commit/42303a2e6b0f77b2db1b222df4240866cf0f1492) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/validator package — JSON Schema validator backed by @cfworker/json-schema, safe for secure runtimes that disallow `new Function()` (e.g., Cloudflare Workers). Replaces `@formspec/ajv-vocab` which required vocabulary registration for extension keywords. The new validator silently ignores `x-formspec-*` keywords with no setup needed.
