---
"@formspec/cli": patch
---

Fixed `resolveCompiledPath` extension mapping to match TypeScript's NodeNext emit conventions: `.mts` now resolves to `.mjs` and `.cts` now resolves to `.cjs` (previously `.mts` was force-mapped to `.js` and `.cts` was left unchanged), so default compiled-path resolution no longer produces a wrong import path for `.mts`/`.cts` sources. Also removed the unreachable `outDir` parameter and remapping branch, which had no caller and no test coverage; the `--compiled` override behavior is unchanged.
