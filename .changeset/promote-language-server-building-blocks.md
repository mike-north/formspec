---
"@formspec/language-server": minor
---

Promote server composition building blocks to public API — `getCompletionItemsAtOffset`, `getHoverAtOffset`, `fileUriToPathOrNull`, `getPluginCompletionContextForDocument`, and `getPluginHoverForDocument` are now exported as `@public` for consumers building custom language servers on top of these primitives.
