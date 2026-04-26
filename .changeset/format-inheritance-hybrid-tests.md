---
"@formspec/build": patch
---

Add regression tests for `@format` inheritance across hybrid heritage + type-alias chains (issue #383). The unified BFS in `collectInheritedTypeAnnotations` already crosses alias boundaries in both directions; these tests pin that behavior so a future refactor cannot break either composition direction.
