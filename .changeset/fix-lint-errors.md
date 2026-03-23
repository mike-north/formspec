---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/runtime": patch
---

Fix all ESLint errors and add lint enforcement to CI

- Fix lint errors across packages (build, cli, dsl, eslint-plugin, runtime)
- Add lint step to CI workflow to enforce rules on all future PRs
- Fixes include: proper null checks, type assertions, array syntax, template literals, and unused variable handling
