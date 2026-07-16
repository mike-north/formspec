# @formspec/language-server

Language-server support for FormSpec TSDoc tags.

The packaged server is a reference implementation built on top of the
composable completion, hover, and diagnostics helpers exported by this package.
Downstream tools can reuse those helpers directly and own the final publishing
and presentation behavior themselves.

## Install

```bash
pnpm add @formspec/language-server
```

## Features

- completion items for FormSpec tags
- hover documentation for recognized tags
- optional plugin-backed diagnostics publishing

Go-to-definition for `{@link}` references (per 004 §5.4) is handled by the
TypeScript language service itself; this server does not advertise
`definitionProvider`.

Diagnostics are off by default. When enabled, the packaged server consumes
canonical FormSpec diagnostics from `@formspec/ts-plugin` and converts them to
LSP diagnostics using the same exported helpers that downstream consumers can
call directly.

## Usage

```ts
import {
  createServer,
  getCompletionItems,
  getHoverForTag,
  getPluginDiagnosticsForDocument,
  toLspDiagnostics,
} from "@formspec/language-server";

const server = createServer();
const completions = getCompletionItems();
const hover = getHoverForTag("minimum");
```

To enable packaged diagnostics publishing:

```ts
const server = createServer({
  diagnosticsMode: "plugin",
  diagnosticSource: "formspec",
});
```

For full white-label control, bypass `createServer()` and use:

- `getPluginDiagnosticsForDocument(...)`
- `toLspDiagnostics(...)`

or map canonical FormSpec diagnostics to your own editor/UI model directly.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.
