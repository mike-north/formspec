---
"@formspec/ts-plugin": patch
---

Contain analysis exceptions in the in-process semantic service. `getCompletionContext`, `getDiagnostics`, `getFileSnapshot`, and `getHover` now catch exceptions raised while building a file snapshot or resolving comment/completion/hover context and degrade to the same fallback shapes already used for missing source (`null` for completion/hover, an `ANALYSIS_EXCEPTION` infrastructure diagnostic for diagnostics/file-snapshot), instead of letting the exception propagate into the embedding host. This brings the in-process path to parity with the IPC transport, which already contained exceptions via `FormSpecPluginService.respondToSocket`.
