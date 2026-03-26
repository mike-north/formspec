---
"@formspec/build": patch
---

Flatten nested conditional UI Schema rules into a single `allOf` list so cross-axis visibility conditions remain representable in JSON Forms output.

This fixes a bug where nested `when()` conditions on different fields could
lose parent axes instead of producing one combined JSON Forms rule.
