---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Restore emission of `TYPE_MISMATCH` diagnostics for batch-level synthetic TypeScript errors.

The Phase 4 Slice C refactor (#384) unintentionally dropped the emission of `kind: "typescript"` diagnostics from `batchCheck.globalDiagnostics` — any TypeScript diagnostic produced by the synthetic check that had no source position or fell outside every tag application's line range was silently dropped instead of surfacing as `TYPE_MISMATCH`. This restores the emission via a new `_mapGlobalSyntheticTsDiagnostics` helper, anchored at a span covering every tag application in the batch. Setup-kind globals continue to be pre-emitted at the file-level span by the snapshot entry path and are filtered out of this secondary emission to prevent double-surface.
