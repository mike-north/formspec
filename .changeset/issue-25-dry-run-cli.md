---
"@formspec/cli": minor
---

Add `--dry-run` to `formspec generate` so callers can inspect planned output files, including `schema.json`, `ui_schema.json`, `params.ui_schema.json`, and optional `*.ir.json` files, without writing anything to disk.
