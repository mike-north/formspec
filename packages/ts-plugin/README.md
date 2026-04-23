# @formspec/ts-plugin

TypeScript language service plugin for FormSpec semantic comment analysis.

This package serves two roles:

- a turnkey `tsserver` plugin via `@formspec/ts-plugin`
- a composable in-process semantic API for downstream TypeScript hosts

The shipped plugin is the reference implementation. Downstream tools that
already own their own TypeScript plugin/runtime can use
`FormSpecSemanticService` and `createLanguageServiceProxy(...)` directly while
reusing the same host `Program`.

## Install

```bash
pnpm add -D @formspec/ts-plugin
```

## `tsconfig.json` Setup

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@formspec/ts-plugin" }]
  }
}
```

The package root is intentionally a hybrid CommonJS surface: `tsserver` can
load it directly as a plugin module, while downstream hosts can also import the
same package as a library to access FormSpec composition primitives.

## Public Composition APIs

```ts
import { FormSpecSemanticService, createLanguageServiceProxy } from "@formspec/ts-plugin";
```

`FormSpecSemanticService` provides:

- `getFileSnapshot(filePath)`
- `getCompletionContext(filePath, offset)`
- `getHover(filePath, offset)`
- `getDiagnostics(filePath)`
- `scheduleSnapshotRefresh(filePath)`
- `getStats()`

`FormSpecPluginService` wraps the same semantic service with the manifest + IPC
transport used by the packaged language server.

## Reference Host Example

The shipped FormSpec `tsserver` plugin is only one reference implementation.
Downstream tools that already own a TypeScript `Program` can build their own
feedback layer directly on top of `FormSpecSemanticService`.

See:

- [reference-host-example.ts](https://github.com/mike-north/formspec/blob/main/packages/ts-plugin/src/reference-host-example.ts)
- [downstream-authoring-host.test.ts](https://github.com/mike-north/formspec/blob/main/packages/ts-plugin/src/__tests__/downstream-authoring-host.test.ts)

These source-repository references intentionally show a downstream host that
renders diagnostics from `code` + `data` instead of reusing FormSpec's default
message text.

## White-Label Diagnostics

Diagnostics returned by the semantic service and plugin transport include:

- stable machine-readable `code`
- structured `category`
- raw diagnostic `data`
- optional `relatedLocations`
- default human-readable `message`

Downstream tools can ignore `message` and render from `code` + `data` if they
want full control over presentation.

## Profiling

Set `FORMSPEC_PLUGIN_PROFILE=1` to enable semantic query hotspot logging.

Set `FORMSPEC_PLUGIN_PROFILE_THRESHOLD_MS=<number>` to raise or lower the
minimum total query duration required before a profiling summary is logged.
Empty or non-finite values are ignored.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.