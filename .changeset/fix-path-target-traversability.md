---
"@formspec/build": patch
---

Fix path-target constraint traversability check: validation now correctly rejects constraints targeting non-traversable types (e.g., primitives) via the `:path` modifier
