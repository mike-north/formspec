---
"@formspec/eslint-plugin": patch
---

Fix `target-resolution/valid-path-target` false positives on path targets that cross an optional intermediate property. `:path` walks now strip `undefined`/`null` before resolving each hop, so targets like `:address.zip` on an optional `address?: { zip: number }` no longer report `unknownPathTarget`. A genuinely missing segment still reports.
