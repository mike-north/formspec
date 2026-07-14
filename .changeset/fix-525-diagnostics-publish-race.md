---
"@formspec/language-server": patch
---

Fix a diagnostics publishing race in the reference language server. Diagnostics
now publish per-URI monotonically — a slow or stale plugin query that resolves
out of order can no longer clobber fresher diagnostics with an empty set.
Content-change publishing is debounced, and diagnostics for open documents are
re-published automatically once a stale plugin snapshot becomes fresh, without
requiring an edit. New `diagnosticsDebounceMs` and `diagnosticsFreshnessPollMs`
options on `createServer` tune these intervals.
