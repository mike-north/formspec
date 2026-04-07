---
"@formspec/build": minor
"@formspec/eslint-plugin": patch
---

Finish `@discriminator` specialization for generic object aliases.

- `@formspec/build` now supports discriminator specialization for object-like generic type aliases expressed as type literals, parenthesized type literals, intersections, and parenthesized intersections.
- Discriminator resolution now prefers concrete literal identities exposed on bound types (for example `readonly object: "customer"`) before falling back to resolved metadata, and supports discriminator-only `apiNamePrefix` application for metadata-derived values.
- `@formspec/eslint-plugin` now accepts discriminator target fields whose types become string-like through generic constraints or base constraints, including object-like type alias intersections.
