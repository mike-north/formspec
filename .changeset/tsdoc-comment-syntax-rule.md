---
"@formspec/eslint-plugin": minor
"@formspec/analysis": patch
---

Add `formspec/tag-recognition/tsdoc-comment-syntax` ESLint rule as a drop-in replacement for `tsdoc/syntax`

**@formspec/eslint-plugin:**

- New `tag-recognition/tsdoc-comment-syntax` rule that validates TSDoc comment syntax using FormSpec's TSDoc configuration
- Suppresses false positives on raw-text FormSpec tag payloads (`@pattern` regex values, `@enumOptions` JSON arrays, `@defaultValue` JSON objects) — fixes the false positive reported in issue #291
- Enabled as `"error"` in both `recommended` and `strict` configs
- Provides equivalent coverage to `tsdoc/syntax` from `eslint-plugin-tsdoc` without the false positives on FormSpec-annotated files
- See README section "Replacing `tsdoc/syntax`" for migration guidance

**@formspec/analysis:**

- Export `getOrCreateTSDocParser` from the `@formspec/analysis/internal` subpath
