---
"@formspec/language-server": patch
---

Fix a gap in the per-URI monotonic diagnostics guard (#525/#586): closing and
reopening a document while a diagnostics query is still in flight could
publish stale pre-close diagnostics over the reopened document's fresh
result. Reopening resets the LSP document version (e.g. VS Code restarts at
1), which defeated both the closed-document guard and the monotonic-version
guard. Diagnostics publishing now also tracks a per-URI open/close
generation counter and drops any query result whose generation has been
superseded by a close-then-reopen.
