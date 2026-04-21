---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Add test-only regression coverage for issue #367 and skipped markers for issue #374. One passing bug-report-verbatim test and four `it.skip` tests for the type-alias derivation gap live in `packages/build/src/__tests__/format-inheritance-derived-types.test.ts`. No published-package behavior changes; the patch bumps are required by the changesets workflow for any touched `packages/build` file.
