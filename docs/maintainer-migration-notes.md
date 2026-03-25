# Maintainer Migration Notes

This document is non-normative. It exists to help maintainers translate the current codebase toward the target architecture described in [001-canonical-ir.md](/Users/mnorth/Development/formspec/scratch/001-canonical-ir.md).

It is intentionally separate from the spec because it discusses current implementation names, transitional carrier types, and compatibility shims. Nothing in this file should be read as a requirement to preserve legacy decorator-based behavior.

---

## 1. `FormElement` to Target IR

The current `FormElement` discriminated union maps to the target IR roughly as follows:

| Current Type                  | Target IR shape                                                           |
| ----------------------------- | ------------------------------------------------------------------------- |
| `TextField<N>`                | `FieldNode` with `PrimitiveTypeNode("string")`                            |
| `NumberField<N>`              | `FieldNode` with `PrimitiveTypeNode("number")`                            |
| `BooleanField<N>`             | `FieldNode` with `PrimitiveTypeNode("boolean")`                           |
| `StaticEnumField<N, O>`       | `FieldNode` with `EnumTypeNode` (members from `options`)                  |
| `DynamicEnumField<N, Source>` | `FieldNode` with statically known value type plus runtime option metadata |
| `DynamicSchemaField<N>`       | `FieldNode` with `DynamicTypeNode("schema", schemaSource)`                |
| `ArrayField<N, Items>`        | `FieldNode` with `ArrayTypeNode` (items from elements)                    |
| `ObjectField<N, Props>`       | `FieldNode` with `ObjectTypeNode` (properties from elements)              |
| `Group<Elements>`             | `GroupLayoutNode`                                                         |
| `Conditional<K, V, Elements>` | `ConditionalLayoutNode`                                                   |

The chain DSL canonicalizer walks the `FormSpec<Elements>` structure and produces `FormIR`. Inline options on chain DSL fields (`label`, `min`, `max`, `required`, etc.) become `AnnotationNode` and `ConstraintNode` entries with `surface: "chain-dsl"` provenance.

Common mappings:

- `label` → `DisplayNameAnnotationNode`
- `placeholder` → `PlaceholderAnnotationNode`
- `required` → `FieldNode.required`
- `min` / `max` → `NumericConstraintNode("minimum")` / `NumericConstraintNode("maximum")`
- `minItems` / `maxItems` → array cardinality constraints on the field

## 2. `FieldInfo` to `FieldNode`

The current TSDoc/type-analysis path produces `FieldInfo[]` via static analysis. Under the target architecture, this analysis still runs, but its output is canonicalized to `FieldNode` rather than passed directly to legacy schema-generation helpers.

Approximate mapping:

| Current `FieldInfo` property                    | Target IR                                            |
| ----------------------------------------------- | ---------------------------------------------------- |
| `name`                                          | `FieldNode.name`                                     |
| `type` (ts.Type)                                | Resolved to a `TypeNode` by the type-to-IR converter |
| `optional`                                      | `FieldNode.required = !optional`                     |
| `deprecated`                                    | `DeprecatedAnnotationNode`                           |
| `defaultValue`                                  | `DefaultValueAnnotationNode`                         |
| legacy extracted tag/decorator metadata carrier | Normalized to `ConstraintNode` and `AnnotationNode`  |

Historically, some implementations used `DecoratorInfo`-shaped carriers, including for synthetic JSDoc-derived metadata. Those are transitional implementation details only.

Approximate historical mapping examples:

| Legacy metadata shape    | Target IR                                      |
| ------------------------ | ---------------------------------------------- |
| `Minimum(n)`             | `NumericConstraintNode("minimum", n)`          |
| `Maximum(n)`             | `NumericConstraintNode("maximum", n)`          |
| `ExclusiveMinimum(n)`    | `NumericConstraintNode("exclusiveMinimum", n)` |
| `ExclusiveMaximum(n)`    | `NumericConstraintNode("exclusiveMaximum", n)` |
| `MinLength(n)`           | `LengthConstraintNode("minLength", n)`         |
| `MaxLength(n)`           | `LengthConstraintNode("maxLength", n)`         |
| `Pattern(s)`             | `PatternConstraintNode(s)`                     |
| `Field({ displayName })` | `DisplayNameAnnotationNode(displayName)`       |
| `Field({ description })` | `DescriptionAnnotationNode(description)`       |
| `Field({ placeholder })` | `PlaceholderAnnotationNode(placeholder)`       |

Legacy decorator-specific resolution logic should be deleted, not preserved. The target system is TSDoc plus ChainDSL only.

## 3. Constraint Tag Registry Migration

The current `CONSTRAINT_TAG_DEFINITIONS` map in `@formspec/core` can be treated as a temporary compatibility source while the new extension/tag registry is introduced.

Target direction:

- built-in constraint registrations declare their TSDoc tag names explicitly
- the tag parser looks up registrations by name
- compatibility exports may remain temporarily during migration
- the registry, not a legacy constant table, becomes authoritative

## 4. Constraint Profiles and Validation

The current `ConstraintConfig` type in `@formspec/constraints` can be reinterpreted as a profile evaluated during the Validate phase, after contradiction checking.

Approximate mapping examples:

| Current `ConstraintConfig` key      | Target enforcement idea                              |
| ----------------------------------- | ---------------------------------------------------- |
| `fieldTypes.dynamicEnum: "error"`   | Error on runtime option-capable fields when disabled |
| `fieldTypes.dynamicSchema: "error"` | Error on `DynamicTypeNode("schema")` when disabled   |
| `layout.group: "off"`               | Restrict `GroupLayoutNode` usage                     |
| `layout.conditionals: "warn"`       | Warn on `ConditionalLayoutNode` usage                |
| `layout.maxNestingDepth: N`         | Error when nesting depth exceeds `N`                 |

This enforcement belongs in validation of the IR, not in canonicalization and not in the generators.
