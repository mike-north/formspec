---
"@formspec/analysis": patch
"@formspec/build": minor
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"formspec": patch
---

Tighten exported API surfaces so the published declarations, API Extractor rollups, and generated docs stay aligned.

This promotes a small set of already-exposed types to supported public exports, replaces a few leaked internal type references with public ones, and keeps the root workspace lint from traversing nested agent worktrees.
