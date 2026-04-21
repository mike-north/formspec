---
"@formspec/analysis": patch
"@formspec/build": patch
---

Relocate setup diagnostics to registry construction time.

`UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` and `SYNTHETIC_SETUP_FAILURE` diagnostics are now emitted exactly once per `createExtensionRegistry` call (build consumer) or `buildFormSpecAnalysisFileSnapshot` call (snapshot consumer), anchored at the extension registration site (`surface: "extension"`, line 1, column 0). Previously, these diagnostics fired on every tag-application validation call, bypassing the LRU cache entirely.
