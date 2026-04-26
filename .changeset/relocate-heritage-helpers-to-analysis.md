---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Relocate the `@format` heritage walker (`collectInheritedTypeAnnotations`, `extractNamedTypeAnnotations`, `INHERITABLE_TYPE_ANNOTATION_KINDS`) from `@formspec/build` to `@formspec/analysis` (issue #383 follow-up; resolves #379). The walk is now reusable by IDE surfaces (hover, diagnostics) without depending on `@formspec/build`. The walk itself is parser-agnostic — callers supply a `HeritageAnnotationExtractor` callback so the analysis package does not bind to build's TSDoc parser or `ExtensionRegistry`. Build keeps a thin adapter that supplies the existing extractor; no behavior change.
