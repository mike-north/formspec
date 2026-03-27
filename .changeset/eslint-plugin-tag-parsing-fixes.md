---
"@formspec/eslint-plugin": patch
---

Fix ESLint FormSpec tag parsing so `@pattern` values containing inline `@...` text are handled correctly, and allow `:singular` / `:plural` display-name targets without false-positive member-target errors.
