---
"@formspec/build": patch
---

Fix type-level TSDoc annotations (e.g. `@format monetary-amount`) not being inherited when one interface extends another. Derived types now carry `format`, `displayName`, `description`, and other type-level annotations from their base interfaces, with closer declarations taking precedence over more distant ones on same-kind conflicts. Multi-level inheritance (A → B → C) and multiple `extends` clauses (A extends B, C) are both supported.
