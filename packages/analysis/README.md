# @formspec/analysis

Shared comment-tag analysis utilities for FormSpec tooling.

This package centralizes:

- FormSpec tag registry metadata
- hover/completion-facing tag documentation
- target-centric constraint-site resolution
- semantic validation for resolved constraint targets

## Install

```bash
pnpm add @formspec/analysis
```

This package is primarily for tooling authors. Most app code should consume higher-level packages such as `@formspec/ts-plugin` or `@formspec/language-server`.

## Entry Points

| Entry point                   | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `@formspec/analysis`          | Stable protocol types and runtime helpers             |
| `@formspec/analysis/internal` | Unstable lower-level parsing, registry, and IPC APIs  |

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See the repository root `LICENSE` file for details.
