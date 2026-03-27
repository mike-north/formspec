# @formspec/cli

CLI for generating schemas and canonical IR from TypeScript source files.

## Install

```bash
pnpm add -D @formspec/cli
```

## Commands

### Generate Schemas

```bash
formspec generate ./src/forms.ts UserForm -o ./generated
```

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

## Notes

- Class and interface analysis uses the TypeScript compiler directly.
- Chain DSL export generation requires compiled JavaScript that the CLI can load.
- `--validate-only` exercises the same validation path used by schema generation.

## License

UNLICENSED
