---
"@formspec/eslint-plugin": patch
---

Fix `tag-recognition/no-unknown-tags` and `tag-recognition/tsdoc-comment-syntax` rejecting extension-registered annotation tags (e.g. `@primaryField`). Both rules now iterate `extension.annotations` in addition to `constraintTags` and `metadataSlots`.
