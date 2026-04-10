---
"@formspec/build": minor
"@formspec/cli": patch
"formspec": patch
---

Expose resolved type metadata on `DiscoveredTypeSchemas`, add explicit `errorReporting: "throw" | "diagnostics"` overloads on the main static schema generation entry points, and deprecate the older `generateSchemasDetailed()` compatibility wrappers. This also rolls the updated build dependency into the published CLI and umbrella packages.
