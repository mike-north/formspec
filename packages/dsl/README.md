# @formspec/dsl

Chain DSL for defining FormSpec forms with TypeScript inference.

## Install

```bash
pnpm add @formspec/dsl @formspec/build
```

Or use the umbrella package:

```bash
pnpm add formspec
```

## Quick Start

```ts
import { field, formspec, group, is, type InferFormSchema, when } from "@formspec/dsl";
import { buildFormSchemas } from "@formspec/build";

const ProfileForm = formspec(
  group(
    "Profile",
    field.text("displayName", { required: true }),
    field.enum("role", ["admin", "member"] as const, { required: true })
  ),
  when(is("role", "admin"), field.boolean("superUser"))
);

type ProfileData = InferFormSchema<typeof ProfileForm>;

const { jsonSchema, uiSchema } = buildFormSchemas(ProfileForm);
```

## Main Builders

- `formspec(...elements)`
- `field.text(name, config?)`
- `field.number(name, config?)`
- `field.boolean(name, config?)`
- `field.enum(name, options, config?)`
- `field.dynamicEnum(name, source, config?)`
- `field.dynamicSchema(name, schemaSource, config?)`
- `field.array(name, ...elements)`
- `field.arrayWithConfig(name, config, ...elements)`
- `field.object(name, ...elements)`
- `field.objectWithConfig(name, config, ...elements)`
- `group(label, ...elements)`
- `when(predicate, ...elements)`
- `is(fieldName, value)`
- `validateForm(elements)`
- `logValidationIssues(result)`

## Notes

- Use `as const` for enum option arrays when you want literal inference from variables.
- `group()` is layout-only; it does not change the data shape.
- `when()` affects UI behavior, not whether a field exists in the JSON Schema.

## License

UNLICENSED
