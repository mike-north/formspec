---
"@formspec/build": minor
"@formspec/cli": minor
---

Switch constraint validation to semantic diagnostic codes such as `CONTRADICTING_CONSTRAINTS`, `TYPE_MISMATCH`, and `UNKNOWN_EXTENSION`.

The CLI now prints those codes with repo-relative source locations so validation output is stable and reviewable in tests and downstream tooling.
