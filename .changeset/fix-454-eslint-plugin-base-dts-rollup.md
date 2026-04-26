---
"@formspec/eslint-plugin": patch
---

Fix `@formspec/eslint-plugin/base` shipping with no `.d.ts` rollup, which made consumer projects fall back to implicit `any` for `createConstraintRule` and the JSDoc/type utility helpers.

The package's `exports["./base"].types` pointed at `./dist/base.d.ts`, but the build never produced that file — only the bundled `.cjs`/`.js` outputs and per-source declarations under `dist/src/`. Added a second API Extractor configuration (`api-extractor.base.json`) targeting `src/base.ts`, wired into the `build` and `api-extractor[:local]` scripts so both the index and base entry points get rolled up. Added `@public` release tags to the symbols re-exported from `base.ts` so API Extractor accepts the new entry point.
