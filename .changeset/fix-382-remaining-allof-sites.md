---
"@formspec/build": patch
"formspec": patch
---

Flatten remaining `allOf` emission sites in the JSON Schema emitter to sibling keywords under JSON Schema 2020-12 (§10.2.1), so downstream renderers (e.g., the Stripe dashboard) that do not unwrap `allOf` no longer silently drop path-targeted overrides.

- **Inline-object missing-property fallback**: when a path-target override names a property not declared on an inline-object base, the override is now merged into the base's `properties` as siblings (with `additionalProperties`/`type` preserved), instead of wrapping the base in `allOf`.
- **Pre-composed `allOf` append**: when the base schema is already an `allOf` with a single member whose keys do not conflict with the override, the composition is flattened to siblings. `allOf` is retained only when the composition genuinely cannot be expressed as siblings (multiple members, or key collisions).

Follow-up to #364/#365; closes #382.
