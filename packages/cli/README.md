# @formspec/cli

CLI for generating schemas and canonical IR from TypeScript source files.

## Install

```bash
pnpm add -D @formspec/cli
```

The package installs a `formspec` binary.

## Commands

### Generate Schemas

```bash
formspec generate ./src/forms.ts UserForm -o ./generated
```

`generate` also accepts the legacy `analyze` alias for backwards compatibility.

### Generate From Chain DSL Exports

```bash
formspec generate ./src/forms.ts -o ./generated
```

### Emit Canonical IR

```bash
formspec generate ./src/forms.ts UserForm --emit-ir -o ./generated
```

### Validate Only

```bash
formspec generate ./src/forms.ts UserForm --validate-only
```

### Dry Run

```bash
formspec generate ./src/forms.ts UserForm --dry-run -o ./generated
```

### Use An Explicit Compiled JS Entry

```bash
formspec generate ./src/forms.ts --compiled ./dist/forms.js -o ./generated
```

## Notes

- Static analysis covers classes, interfaces, and type aliases using the TypeScript compiler directly.
- Chain DSL export generation requires compiled JavaScript that the CLI can load.
- `--compiled` / `-c` overrides the auto-detected compiled JavaScript path for chain DSL loading.
- `--validate-only` exercises the same validation path used by schema generation.
- `--emit-ir` writes canonical IR as `<name>.ir.json` alongside generated schema files.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See the repository root `LICENSE` file for details.
