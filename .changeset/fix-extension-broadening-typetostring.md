---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix `hasExtensionBroadening` to use NoTruncation when matching extension type names, preventing false INVALID_TAG_ARGUMENT on complex types (Copilot follow-up on PR #354).
