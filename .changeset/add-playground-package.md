---
"@formspec/playground": minor
"@formspec/build": minor
"@formspec/constraints": minor
"@formspec/eslint-plugin": patch
---

Add interactive FormSpec playground with browser-safe package entry points

**@formspec/playground:**
- New package with interactive playground for writing and testing FormSpec definitions
- Real-time TypeScript compilation and schema generation
- Live form preview with JSON Forms
- Monaco editor with FormSpec type definitions and autocomplete
- ESLint integration showing constraint violations in real-time
- Configurable constraints UI for restricting allowed DSL features
- Automatically deployed to GitHub Pages

**@formspec/build:**
- Add `@formspec/build/browser` entry point for browser environments
- Excludes Node.js-specific functions like `writeSchemas`
- Exports `buildFormSchemas`, `generateJsonSchema`, `generateUiSchema`

**@formspec/constraints:**
- Add `@formspec/constraints/browser` entry point for browser environments
- Excludes file-based config loader requiring Node.js APIs
- Exports `loadConfigFromString`, `defineConstraints`, validators

**@formspec/eslint-plugin:**
- Update constraint rules to import from browser-safe entry points
