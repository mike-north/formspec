---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add typed argument parser skeleton (Phase 1 Slice 0)

Introduces `packages/analysis/src/tag-argument-parser.ts` with the public API,
tag-family registry, and dispatch stub. Per-family parser bodies are filled
in by Slices A/B/C; canary tests land in Slice D. This is a no-wiring change —
consumers (`tsdoc-parser.ts`, `file-snapshots.ts`) keep calling the synthetic
path as before. Implements §4 "Phase 1" + §9.4 0.5j carryover of
`docs/refactors/synthetic-checker-retirement.md`.
