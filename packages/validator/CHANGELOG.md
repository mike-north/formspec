# @formspec/validator

## 0.1.0-alpha.64

### Patch Changes

- [#412](https://github.com/mike-north/formspec/pull/412) [`f91cc78`](https://github.com/mike-north/formspec/commit/f91cc78817cfb3fc5a1a492f3812c2e6dc186c46) Thanks [@mike-north](https://github.com/mike-north)! - Add `DOM` to the validator's build `lib` so the global `URL` type referenced by `@cfworker/json-schema`'s published declarations resolves under TypeScript 6.x. No runtime impact — declaration-emit only.

## 0.1.0-alpha.63

### Patch Changes

- [#410](https://github.com/mike-north/formspec/pull/410) [`2f430b6`](https://github.com/mike-north/formspec/commit/2f430b60f55c600b3e18a91a54f637feb56b9a55) Thanks [@mike-north](https://github.com/mike-north)! - Internal restructure: tests moved from `src/__tests__/` to a sibling `tests/` folder in each package, with the TypeScript typecheck scope widened to cover them. No public API changes.

## 0.1.0-alpha.60

### Patch Changes

- [#404](https://github.com/mike-north/formspec/pull/404) [`f0929c6`](https://github.com/mike-north/formspec/commit/f0929c60e7f74db7da6cffd589a8daaa5ba1e834) Thanks [@mike-north](https://github.com/mike-north)! - Tighten external-dependency minimums so every package advertises the version it's actually built against, and align internal devDependencies across the workspace.

  Consumer-visible:
  - `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised from `^5.0.0` to `^5.7.3`.
  - `@formspec/cli`: `typescript` runtime dependency raised from `^5.0.0` to `^5.7.3`.
  - `@formspec/eslint-plugin`: `eslint` peer dependency raised from `^9.0.0` to `^9.39.2`.

  Internal only (devDependencies): `vitest` aligned to `^3.2.4` across all packages; `@microsoft/api-extractor` upgraded to `^7.58.7` (latest 7.x, now bundling TypeScript 5.9.3).

  Consumers already on TypeScript 5.7+ and ESLint 9.39+ are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade.

- [#405](https://github.com/mike-north/formspec/pull/405) [`d70c0b0`](https://github.com/mike-north/formspec/commit/d70c0b0414eb1630b5593ebe0a22a9e3dc3c2d0a) Thanks [@mike-north](https://github.com/mike-north)! - Raise the `typescript` minimum from `^5.7.3` to `^5.9.3` for the workspace packages that declare a `typescript` peer or runtime dependency, so those packages advertise TypeScript 5.9 as their supported baseline. The other packages listed in this changeset receive a patch bump because they are part of the repo's linked version group.

  Consumer-visible:
  - `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised to `^5.9.3`.
  - `@formspec/cli`: `typescript` runtime dependency raised to `^5.9.3`.
  - `@formspec/config`, `@formspec/dsl`, `@formspec/language-server`, `@formspec/runtime`, `@formspec/validator`, and `formspec`: patch bumps only, with no direct `typescript` dependency range change in this changeset.

  Consumers already on TypeScript 5.9 are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade where applicable.

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
