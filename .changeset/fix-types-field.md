---
"@formspec/dsl": patch
"@formspec/core": patch
"@formspec/build": patch
"@formspec/runtime": patch
---

Fix TypeScript type resolution by including API Extractor in build

Previously, the `types` field in package.json pointed to rolled-up declaration
files (e.g., `./dist/dsl.d.ts`), but these files were not being generated
during the build because API Extractor was not included in the build script.

This caused TypeScript users to see:
```
error TS2307: Cannot find module '@formspec/dsl' or its corresponding type declarations.
```

The fix adds `api-extractor run --local` to the build scripts for all affected
packages, ensuring the declaration rollup files are generated during every build.
