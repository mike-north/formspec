---
"@formspec/cli": patch
---

Bump the bundled `typescript` runtime dependency from `^5.9.3` to `^6.0.0`. The CLI now performs schema generation against TypeScript 6.x internally. Source code that compiles cleanly under TS 5.9 also compiles under TS 6.0, so this is functionally invisible to consumers.
