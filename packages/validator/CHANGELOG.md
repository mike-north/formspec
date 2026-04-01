# @formspec/validator

## 0.1.0-alpha.23

### Minor Changes

- [#181](https://github.com/mike-north/formspec/pull/181) [`ef268b3`](https://github.com/mike-north/formspec/commit/ef268b37c5e9a0fca0b69d1efecb27315a00a211) Thanks [@mike-north](https://github.com/mike-north)! - Generate API Extractor declaration rollups for the public, beta, alpha, and untrimmed internal release-tag surfaces, and emit matching API report variants for each package.

  The package root `types` entries continue to point at the public rollups, while the additional rollups now exist as build artifacts for tooling, monorepo validation, and future subpath exposure.

## 0.1.0-alpha.12

### Minor Changes

- [#64](https://github.com/mike-north/formspec/pull/64) [`42303a2`](https://github.com/mike-north/formspec/commit/42303a2e6b0f77b2db1b222df4240866cf0f1492) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/validator package — JSON Schema validator backed by @cfworker/json-schema, safe for secure runtimes that disallow `new Function()` (e.g., Cloudflare Workers). Replaces `@formspec/ajv-vocab` which required vocabulary registration for extension keywords. The new validator silently ignores `x-formspec-*` keywords with no setup needed.
