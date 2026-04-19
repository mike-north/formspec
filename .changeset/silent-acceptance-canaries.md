---
"@formspec/analysis": patch
---

Add silent-acceptance canary tests (Phase 0.5j, refactor plan S.9.3 #14). 25 negative-only test cases across @minimum, @enumOptions, @pattern, @uniqueItems, and @const identify pre-existing gaps where the analysis pipeline accepts invalid arguments without emitting a diagnostic.
