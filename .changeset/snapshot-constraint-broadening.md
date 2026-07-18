---
"@formspec/analysis": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
---

Fix the snapshot consumer (used by `@formspec/language-server` and `@formspec/ts-plugin`) never applying constraint broadening for builtin constraint tags on registered custom types. `@minimum`, `@pattern`, and other builtin tags on a field whose type (or, for path-targeted tags, whose path terminal type) is a registered custom type now produce the broadened `CustomConstraintNode` instead of a generic numeric/length constraint, matching the build consumer's behavior (issue #395 / PR #398). This fixes natural-language summaries and hover text in downstream IDE tooling losing type-specific semantics (e.g. decimal formatting, unit hints, vocabulary-mode keywords).

For `@formspec/language-server` and `@formspec/ts-plugin`, this is a user-visible fix: hover text and diagnostics for fields of brand- or name-registered custom types now show the type-specific broadened constraint instead of the raw builtin keyword, and brand-only registrations no longer receive a spurious `TYPE_MISMATCH` error alongside the correctly broadened output.
