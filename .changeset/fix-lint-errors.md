---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/decorators": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/runtime": patch
---

Fix all ESLint errors and add lint enforcement to CI

- Fix 213 lint errors across 6 packages (build, cli, decorators, dsl, eslint-plugin, runtime)
- Add lint step to CI workflow to enforce rules on all future PRs
- Fixes include: proper null checks, type assertions, array syntax, template literals, and unused variable handling
