# @formspec/language-server

Language server protocol (LSP) features for FormSpec, providing editor intelligence for JSDoc constraint tags.

## Installation

```bash
npm install @formspec/language-server
# or
pnpm add @formspec/language-server
```

## Requirements

This package is ESM-only and requires:

```json
// package.json
{
  "type": "module"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Overview

This package provides language server features for FormSpec's JSDoc constraint tags (`@Minimum`, `@Maximum`, `@Pattern`, etc.). It can be integrated into any LSP-compatible editor.

### Features

- **Completion** — Autocomplete for constraint tag names inside JSDoc comments
- **Hover** — Documentation on hover for constraint tags
- **Go to Definition** — Navigate to constraint definitions _(placeholder — not yet implemented)_

## API Reference

### Functions

| Function                  | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `createServer()`          | Create a full LSP server connection             |
| `getCompletionItems()`    | Get completion items for constraint tags        |
| `getDefinition()`         | Get definition location for a constraint tag    |
| `getHoverForTag(tagName)` | Get hover information for a constraint tag name |

### `createServer()`

Creates a Language Server Protocol connection that handles `initialize`, `textDocument/completion`, `textDocument/hover`, and `textDocument/definition` requests.

```typescript
import { createServer } from "@formspec/language-server";

const connection = createServer();
connection.listen();
```

### `getCompletionItems()`

Returns completion items for all known FormSpec constraint tags.

```typescript
import { getCompletionItems } from "@formspec/language-server";

const items = getCompletionItems();
// [{ label: "@Minimum", kind: CompletionItemKind.Keyword, ... }, ...]
```

### `getHoverForTag(tagName)`

Returns hover documentation for a given tag name, or `null` if the tag is not recognized.

```typescript
import { getHoverForTag } from "@formspec/language-server";

const hover = getHoverForTag("Minimum");
// { contents: { kind: "markdown", value: "..." } }
```

## Editor Integration

### VS Code

Use with a VS Code extension that connects to the language server. The server communicates over the standard LSP protocol via `vscode-languageserver/node.js`.

## License

UNLICENSED
