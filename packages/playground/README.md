# @formspec/playground

Private playground app for interactive FormSpec development inside this monorepo.

## What It Includes

- Monaco editor with FormSpec-aware TypeScript support
- live JSON Schema and UI Schema generation
- canonical IR inspection
- browser-based ESLint integration
- JSON Forms preview

## Run Locally

```bash
pnpm install
pnpm run build
cd packages/playground
pnpm run dev
```

The default dev URL is `http://localhost:5173/formspec/`.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.
