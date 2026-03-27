# @formspec/language-server

Language-server support for FormSpec TSDoc tags.

## Install

```bash
pnpm add @formspec/language-server
```

## Features

- completion items for FormSpec tags
- hover documentation for recognized tags
- go-to-definition support for known tags

Diagnostics are intentionally handled elsewhere; this package focuses on editor assistance.

## Usage

```ts
import { createServer, getCompletionItems, getHoverForTag } from "@formspec/language-server";

const server = createServer();
const completions = getCompletionItems();
const hover = getHoverForTag("minimum");

void server;
void completions;
void hover;
```

## License

UNLICENSED
