---
"@formspec/cli": minor
---

Add @formspec/cli package for static TypeScript analysis and schema generation

This new package provides a CLI tool that generates JSON Schema and JSON Forms UI Schema from TypeScript source files using a hybrid approach:

**Static Analysis (TypeScript Compiler API):**
- Extracts class fields with their TypeScript types
- Parses decorator metadata (@Label, @Min, @Max, etc.)
- Detects method parameters using `InferSchema<typeof X>` pattern
- Converts TypeScript types to JSON Schema and FormSpec fields

**Runtime Execution (Dynamic Import):**
- Loads exported FormSpec constants (chain DSL) at runtime
- Uses @formspec/build generators to produce schemas
- Enables full FormSpec features for method parameters

**Usage:**
```bash
# Analyze a class with decorators
formspec analyze ./src/forms.ts MyClass -o ./generated

# Analyze all FormSpec exports (chain DSL)
formspec analyze ./src/forms.ts -o ./generated
```

**Output Structure:**
```
generated/ClassName/
├── schema.json           # JSON Schema for class fields
├── ux_spec.json          # UI Schema
├── instance_methods/
│   └── methodName/
│       ├── params.schema.json
│       ├── params.ux_spec.json
│       └── return_type.schema.json
└── static_methods/
    └── ...

generated/formspecs/
└── ExportName/
    ├── schema.json
    └── ux_spec.json
```

This approach eliminates the need for type-hint decorators like `@Boolean()` since types are inferred directly from TypeScript.
