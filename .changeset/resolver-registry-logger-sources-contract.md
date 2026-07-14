---
"@formspec/runtime": patch
"formspec": patch
---

Fix two contract inconsistencies in the resolver registry returned by `defineResolvers`:

- The construction-time "Missing resolver" warning now routes through the injected `logger` option (via `logger.warn`) instead of writing directly to `console.warn`, honoring the documented "existing callers produce no output" contract for embedding hosts that supply their own logger.
- `ResolverRegistry.sources()` now returns the form's required data-source names (matching its `Sources[]` type and updated doc comment), rather than the resolver map's registered keys. A source appears even if unresolved; a resolver registered beyond what the form requires is omitted.
