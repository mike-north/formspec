---
"@formspec/cli": patch
---

Improve CLI subprocess behavior for syntax errors and compiled-module load failures.

The CLI now surfaces TypeScript syntax diagnostics directly instead of falling through to a misleading class lookup failure, and it preserves the actual compiled-module load error when chain DSL exports cannot be imported.
