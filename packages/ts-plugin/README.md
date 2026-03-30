# @formspec/ts-plugin

TypeScript language service plugin for FormSpec semantic comment analysis.

This package serves two roles:

- a turnkey `tsserver` plugin via `init()`
- a composable in-process semantic API for downstream TypeScript hosts

The shipped plugin is the reference implementation. Downstream tools that
already own their own TypeScript plugin/runtime can use
`FormSpecSemanticService` and `createLanguageServiceProxy(...)` directly while
reusing the same host `Program`.

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
