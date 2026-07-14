---
"@formspec/eslint-plugin": patch
---

Fix `tag-recognition/no-markdown-formatting` false positives and a destructive autofix on non-Markdown values.

Whitespace-padded `*` (e.g. `"5 * 3 * 2"`) and leading `- `/`N. ` in single-line prose (e.g. `"- item one"`, `"1. reason"`) are no longer treated as Markdown and are no longer reported or rewritten. Remaining ambiguous constructs — single-asterisk italics and multi-line block markers (headings, blockquotes, list markers) — are still reported but are now offered only as ESLint suggestions rather than applied automatically by `--fix`, since stripping them can change the meaning of the text. Unambiguous Markdown (`**bold**`, `_em_`, `[x](y)`, backticked code spans) continues to be reported and auto-fixed.
