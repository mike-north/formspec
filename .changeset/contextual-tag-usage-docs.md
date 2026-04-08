---
"@formspec/analysis": minor
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": minor
---

Expose contextual tag-usage documentation through FormSpec semantic APIs.

- Add occurrence-filtered `contextualSignatures` to serialized tag semantic context.
- Add `contextualTagHoverMarkdown` so downstream editor consumers can render FormSpec-owned, context-appropriate tag docs without reproducing applicability filtering logic.
