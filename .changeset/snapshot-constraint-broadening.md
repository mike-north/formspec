---
"@formspec/analysis": patch
---

Fix the snapshot consumer (used by `@formspec/language-server` and `@formspec/ts-plugin`) never applying constraint broadening for builtin constraint tags on registered custom types. `@minimum`, `@pattern`, and other builtin tags on a field whose type (or, for path-targeted tags, whose path terminal type) is a registered custom type now produce the broadened `CustomConstraintNode` instead of a generic numeric/length constraint, matching the build consumer's behavior (issue #395 / PR #398). This fixes natural-language summaries and hover text in downstream IDE tooling losing type-specific semantics (e.g. decimal formatting, unit hints, vocabulary-mode keywords).
