# @formspec/config

Unified configuration and DSL-policy validation for FormSpec projects.

Use this package when you want project-level rules such as:

- disallowing certain field types
- limiting layout nesting
- restricting selected field options
- registering extensions and project-wide FormSpec settings

## Install

```bash
pnpm add @formspec/config
```

## `formspec.config.ts`

```ts
import { defineFormSpecConfig } from "@formspec/config";

export default defineFormSpecConfig({
  constraints: {
    fieldTypes: {
      dynamicEnum: "warn",
      dynamicSchema: "error",
    },
    layout: {
      conditionals: "off",
      maxNestingDepth: 2,
    },
    fieldOptions: {
      placeholder: "off",
      minItems: "warn",
    },
  },
});
```

## Programmatic Use

```ts
import { loadFormSpecConfig, validateFormSpecElements } from "@formspec/config";
import { field, formspec } from "@formspec/dsl";

const result = await loadFormSpecConfig();
const constraints = result.found ? result.config.constraints : undefined;

const form = formspec(field.text("name"), field.dynamicEnum("country", "countries"));
const validation = validateFormSpecElements(form.elements, { constraints });
```

## Static Non-Node Imports

The main `@formspec/config` entry point does not statically import Node filesystem modules, so browser-oriented tools can import policy helpers without pulling in `node:fs` or `node:path`. Hosts that need config discovery can pass a `FileSystem` adapter for path and file operations:

```ts
import { loadFormSpecConfig, type FileSystem } from "@formspec/config";

const fileSystem: FileSystem = {
  exists: async (path) => existsInHost(path),
  readFile: async (path) => readFromHost(path),
  resolve: (...segments) => resolveInHost(...segments),
  dirname: (path) => dirnameInHost(path),
};

await loadFormSpecConfig({ searchFrom: ".", fileSystem });
```

The adapter covers discovery, existence checks, workspace-root checks, and file reads. Evaluating a TypeScript config module still uses the current Node-compatible `jiti` loader; a non-Node module evaluator is future work.

## Main Exports

- `loadFormSpecConfig`
- `defineFormSpecConfig`
- `defineDSLPolicy`
- `mergeWithDefaults`
- `validateFormSpecElements`
- `validateFormSpec`

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.
