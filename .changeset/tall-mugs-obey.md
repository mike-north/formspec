---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Tighten exported API surfaces so the published declarations, API Extractor rollups, and generated docs stay aligned.

This promotes a small set of already-exposed types to supported public exports, replaces a few leaked internal type references with public ones, and keeps the root workspace lint from traversing nested agent worktrees.
