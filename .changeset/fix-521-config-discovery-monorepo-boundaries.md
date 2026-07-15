---
"@formspec/config": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

Fix config discovery escaping pnpm/lerna/rush monorepos. Discovery now stops at a directory containing `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, or `.git`, in addition to the existing `package.json#workspaces` (npm/yarn) boundary — preventing a stray `formspec.config.ts` in an ancestor directory from being silently adopted.
