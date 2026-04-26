---
"@formspec/eslint-plugin": minor
---

Add `formspec/documentation/remarks-without-summary`, a documentation-hygiene rule for the `REMARKS_WITHOUT_SUMMARY` info diagnostic when `@remarks` appears without summary text before the first tag. The rule is included in both recommended and strict presets as an ESLint warning because ESLint flat config does not have an info severity.
