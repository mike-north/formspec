---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix the completion/hover cursor-context resolver so it no longer treats doc-comment syntax (`/** ... */`) inside string literals or template literals as a genuine FormSpec doc comment. Detection is now AST-gated (via `ts.getLeadingCommentRanges` over the parsed source), matching the precedent already used for the snapshot/diagnostics path, so comment-like text embedded in string content is correctly ignored while real doc comments continue to resolve.
