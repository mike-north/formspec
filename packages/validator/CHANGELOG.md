# @formspec/validator

## 0.1.0-alpha.28

### Patch Changes

- [#199](https://github.com/mike-north/formspec/pull/199) [`c0f731b`](https://github.com/mike-north/formspec/commit/c0f731b9bc867a5ec372fc1ad4af65f944f80baf) Thanks [@mike-north](https://github.com/mike-north)! - Declare MIT licensing across package metadata and README documentation.

## 0.1.0-alpha.26

### Patch Changes

- [#189](https://github.com/mike-north/formspec/pull/189) [`b0b2a7c`](https://github.com/mike-north/formspec/commit/b0b2a7c6eba580a4320b5fd0870aff5fca5cda53) Thanks [@mike-north](https://github.com/mike-north)! - Document previously undocumented exported APIs and enforce API Extractor's
  `ae-undocumented` validation for published package surfaces.
  - Add contributor-facing docs for internal exports and external-facing docs for
    alpha-or-better public APIs.
  - Enable `ae-undocumented` so newly exported APIs must carry TSDoc before they
    can be released.

## 0.1.0-alpha.23

### Minor Changes

- [#181](https://github.com/mike-north/formspec/pull/181) [`ef268b3`](https://github.com/mike-north/formspec/commit/ef268b37c5e9a0fca0b69d1efecb27315a00a211) Thanks [@mike-north](https://github.com/mike-north)! - Generate API Extractor declaration rollups for the public, beta, alpha, and untrimmed internal release-tag surfaces, and emit matching API report variants for each package.

  The package root `types` entries continue to point at the public rollups, while the additional rollups now exist as build artifacts for tooling, monorepo validation, and future subpath exposure.

## 0.1.0-alpha.12

### Minor Changes

- [#64](https://github.com/mike-north/formspec/pull/64) [`42303a2`](https://github.com/mike-north/formspec/commit/42303a2e6b0f77b2db1b222df4240866cf0f1492) Thanks [@mike-north](https://github.com/mike-north)! - Add @formspec/validator package — JSON Schema validator backed by @cfworker/json-schema, safe for secure runtimes that disallow `new Function()` (e.g., Cloudflare Workers). Replaces `@formspec/ajv-vocab` which required vocabulary registration for extension keywords. The new validator silently ignores `x-formspec-*` keywords with no setup needed.
