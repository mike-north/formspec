# 007 — Configuration

> **Status:** Draft
> **Depends on:** [000 (Principles)](./000-principles.md), [003 (JSON Schema Vocabulary)](./003-json-schema-vocabulary.md), [004 (Tooling)](./004-tooling.md), [005 (Numeric Types)](./005-numeric-types.md)
> **Referenced by:** —

---

## 1. Overview

FormSpec's extension system — custom types, constraints, broadenings, annotations, vocabulary keywords, and metadata policies — must be shared across every tool in the pipeline: the build API, CLI, ESLint plugin, language server, and TypeScript plugin. Today each consumer has its own injection point with no shared configuration, which leads to duplicated wiring, inconsistent behavior, and bugs where one tool doesn't know about extensions another tool relies on.

This document specifies a unified `FormSpecConfig` object that serves as the canonical source of truth for all FormSpec settings. The config object is the primary API; a config file (`formspec.config.ts`) is the conventional way to define one.

### 1.1 Principles Satisfied

| Principle                               | Section    | How                                                                                               |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| PP9 (Configurable surface area)         | §2, §3     | Config carries all tunables: extensions, constraints, vendor prefix, enum serialization, metadata |
| PP10 (White-labelable)                  | §3.4       | `vendorPrefix` controls all emitted vendor-scoped keywords                                        |
| A3 (Generation is pure function of IR)  | §4.1       | Config is an explicit input, not ambient state                                                    |
| A6 (Library-first, CLI as thin wrapper) | §4         | Every consumer accepts `FormSpecConfig` programmatically; CLI loads it from a file                |
| A7 (Clear lint vs. LS boundary)         | §4.3, §4.4 | Both tools read the same config for their distinct responsibilities                               |
| E3 (Custom vocabulary namespaced)       | §3.4       | Vendor prefix flows from config to all extension keyword emission                                 |

### 1.2 Scope

This document covers:

- The `FormSpecConfig` type and its fields (§2–§3)
- How each consumer integrates with the config (§4)
- The config file convention and loading semantics (§5)
- Migration path from current per-consumer wiring (§6)

This document does **not** cover:

- Individual extension registration APIs (`defineExtension`, `defineCustomType`, etc.) — see [005](./005-numeric-types.md)

### 1.3 Starting Point

The `FormSpecConfig` type already exists in `@formspec/config` (`packages/constraints/src/types.ts`, line 218) with a `constraints` field and a forward-looking comment:

```typescript
export interface FormSpecConfig {
  constraints?: ConstraintConfig;
  // Future: other top-level config sections
  // build?: BuildConfig;
  // presets?: string[];
}
```

This document specifies the expansion of `FormSpecConfig` from constraint-only configuration to full pipeline configuration, and the migration of the config file format from YAML to TypeScript.

---

## 2. The `FormSpecConfig` Object

### 2.1 Design Principles

1. **Config-first.** `FormSpecConfig` is the canonical source of all FormSpec settings. Consumers that previously accepted individual options (`extensionRegistry`, `vendorPrefix`) derive them from the config.

2. **Programmatic by default.** Extensions require executable code (`defineExtension`, `defineCustomType`), so the config is TypeScript, not YAML. This replaces the current `.formspec.yml` system (which has no users).

3. **Single object, all consumers.** The same `FormSpecConfig` instance is passed to build, lint, language server, and CLI. Each consumer reads the fields it needs.

4. **Optional fields with sensible defaults.** Every field is optional. Defaults match FormSpec's current behavior when no config is provided.

### 2.2 Type Definition

> **Note on `configPath`:** `configPath` is NOT a field of `FormSpecConfig`. It belongs on `StaticSchemaGenerationOptions` (the options object passed to `generateSchemas` and related build APIs). `FormSpecConfig` is runtime data describing the extension surface; `configPath` is a build-time concern that tells the pipeline where to find the config file so it can perform program-level analysis (e.g., resolving `defineCustomType<T>()` type parameters to `ts.Symbol` instances). See §4.1 for usage.

````typescript
import type { ExtensionDefinition, MetadataPolicyInput } from "@formspec/core";

export interface FormSpecConfig {
  /**
   * Extension definitions providing custom types, constraints,
   * annotations, and vocabulary keywords.
   */
  readonly extensions?: readonly ExtensionDefinition[];

  /**
   * Constraint surface configuration — controls which field types,
   * layouts, UI features, and field/control options are allowed.
   *
   * Subsumes the existing `.formspec.yml` `constraints` section.
   */
  readonly constraints?: ConstraintConfig;

  /**
   * Metadata inference and naming policy. Controls how apiName,
   * displayName, and plural forms are derived when not authored.
   */
  readonly metadata?: MetadataPolicyInput;

  /**
   * Vendor prefix for extension-emitted JSON Schema keywords.
   * Must start with "x-".
   * @defaultValue "x-formspec"
   */
  readonly vendorPrefix?: string;

  /**
   * JSON Schema representation for static enums.
   * - "enum": flat { "enum": ["a", "b"] }
   * - "oneOf": { "oneOf": [{ "const": "a" }, ...] }
   * @defaultValue "enum"
   */
  readonly enumSerialization?: "enum" | "oneOf";

  /**
   * Per-package configuration overrides for monorepos.
   *
   * Each key is a glob pattern matched against source file paths
   * relative to the config file's directory. The value is a partial
   * config that merges with (and overrides) the root-level settings.
   *
   * Consumers resolve the effective config for a given file by finding
   * the first matching pattern. If no pattern matches, the root config
   * applies unchanged.
   *
   * @example
   * ```typescript
   * defineFormSpecConfig({
   *   extensions: [stripeStdlibExtension],
   *   metadata: stripeMetadataPolicy,
   *   vendorPrefix: 'x-stripe',
   *   enumSerialization: 'oneOf',
   *   packages: {
   *     'extensions/loyalty-discount/**': {
   *       constraints: billingConstraints,
   *     },
   *     'extensions/invoice-action/**': {
   *       constraints: workflowConstraints,
   *     },
   *     'custom-objects/**': {
   *       constraints: customObjectConstraints,
   *     },
   *   },
   * });
   * ```
   */
  readonly packages?: Record<string, FormSpecPackageOverride>;
}

/**
 * Per-package overrides that merge with the root config.
 * Only fields that vary per package are overridable.
 */
export interface FormSpecPackageOverride {
  /** Override constraint surface for this package. */
  readonly constraints?: ConstraintConfig;
  /** Override enum serialization for this package. */
  readonly enumSerialization?: "enum" | "oneOf";
  /** Override metadata policy for this package. */
  readonly metadata?: MetadataPolicyInput;
}
````

### 2.3 `defineFormSpecConfig`

Identity function for type checking and IDE autocompletion:

```typescript
export function defineFormSpecConfig(config: FormSpecConfig): FormSpecConfig {
  return config;
}
```

### 2.4 Per-File Config Resolution

When a consumer operates on a specific file (build, lint, LS hover/completion), it resolves the effective config:

```typescript
function resolveConfigForFile(
  config: FormSpecConfig,
  filePath: string,
  configDir: string
): ResolvedFormSpecConfig;
```

Resolution algorithm:

1. Start with root-level settings (extensions, metadata, vendorPrefix, enumSerialization, constraints)
2. Compute the file's path relative to the config file's directory
3. Find the **first** matching glob pattern in `packages`
4. Deep-merge the matching override into the root settings (override wins on conflict)
5. Return the merged config

This means programmatic callers in a monorepo pass one config object and a file path — no manual per-package selection:

```typescript
// Build script iterating over all extensions
for (const ext of extensions) {
  generateSchemas({
    config, // same root config for all
    filePath: ext.sourcePath, // resolver picks the right overrides
    typeName: ext.typeName,
  });
}
```

The language server and ESLint plugin use the same resolver — when analyzing a file, they pass the file's path and get the effective config with the right constraint surface.

---

## 3. Config Fields

### 3.1 `extensions`

**Optional.** Array of `ExtensionDefinition` objects. Each extension bundles custom types, constraints, constraint tags, annotations, and vocabulary keywords.

The config carries constructed extension objects, not paths or package names. Extension construction happens in the extension's own module; the config references the result.

Consumers resolve extensions into an `ExtensionRegistry` internally. The registry is an implementation detail — consumers accept `FormSpecConfig`, not `ExtensionRegistry`.

#### 3.1.1 Custom Type Detection Mechanisms

When the build pipeline encounters a TypeScript type that may be a custom FormSpec type, it uses one of three detection mechanisms (resolved in priority order):

1. **Name-based detection** (`tsTypeNames` on `CustomTypeRegistration`) — Matches the literal type reference name as it appears in the source AST. This is the legacy mechanism and has the lowest priority. It is deprecated; see §6.3.

2. **Symbol-based detection** (`defineCustomType<T>()` type parameter) — When the config file uses a type parameter on `defineCustomType<T>()`, the build pipeline resolves `T` to a `ts.Symbol` at config-load time via program analysis of the config file. Lookups are O(1) identity-based comparisons against that symbol. This mechanism is immune to import aliases and type aliases — it matches regardless of how the type is referenced at the call site.

3. **Brand-based detection** (`brand` field on `CustomTypeRegistration`) — Structural detection via `unique symbol` computed property keys. The pipeline inspects each type's property index to find a brand property matching the registered name. Works without config file analysis and is therefore useful in environments where the config file is not included in the TypeScript program.

**Priority:** name-based → symbol-based → brand-based. Name-based wins for backward compatibility. Symbol-based is the most precise mechanism and is the recommended approach for new registrations. Brand-based is the fallback when the config file is unavailable to the build program.

### 3.2 `constraints`

**Optional.** A `ConstraintConfig` object controlling which field types, layouts, UI features, and options are allowed. This is the same type currently used by the `.formspec.yml` system — it moves from YAML to the TypeScript config without changes to the constraint schema.

### 3.3 `metadata`

**Optional.** A `MetadataPolicyInput` object controlling metadata inference:

- `apiName` inference (e.g., camelCase → snake_case)
- `displayName` inference (e.g., camelCase → Sentence Case)
- Pluralization inflection

When omitted, FormSpec's built-in policy applies.

### 3.4 `vendorPrefix`

**Optional.** String prefix for all extension-emitted JSON Schema keywords. Must start with `"x-"`. Flows into all `toJsonSchema` callbacks and built-in annotation keywords.

Default: `"x-formspec"`.

### 3.5 `enumSerialization`

**Optional.** Controls string literal union representation in JSON Schema.

- `"enum"` (default): `{ "enum": ["a", "b", "c"] }`
- `"oneOf"`: `{ "oneOf": [{ "const": "a" }, { "const": "b" }, { "const": "c" }] }`

### 3.6 `packages`

**Optional.** A `Record<string, FormSpecPackageOverride>` mapping glob patterns to per-package overrides. This is the monorepo support mechanism.

Each key is a glob pattern matched against source file paths relative to the config file's directory. The value is a partial config that merges with and overrides the root-level settings. Only settings that genuinely vary per package are overridable: `constraints`, `enumSerialization`, and `metadata`. Settings that are inherently project-wide (`extensions`, `vendorPrefix`) are not overridable per package.

When no `packages` field is present, the root config applies uniformly — single-package projects don't need this field.

**Example: Stripe generated monorepo**

```typescript
import { defineFormSpecConfig } from "@formspec/config";
import { stripeStdlibExtension } from "@stripe/extensibility-jsonschema-tools";
import { stripeMetadataPolicy } from "@stripe/extensibility-tool-utils";
import {
  billingConstraints,
  workflowConstraints,
  customObjectConstraints,
} from "@stripe/extensibility-eslint-plugin";

export default defineFormSpecConfig({
  // Shared across all packages
  extensions: [stripeStdlibExtension],
  metadata: stripeMetadataPolicy,
  vendorPrefix: "x-stripe",
  enumSerialization: "oneOf",

  // Per-package constraint surfaces
  packages: {
    "extensions/loyalty-discount/**": {
      constraints: billingConstraints,
    },
    "extensions/invoice-action/**": {
      constraints: workflowConstraints,
    },
    "custom-objects/**": {
      constraints: customObjectConstraints,
    },
  },
});
```

The language server, ESLint plugin, and build tooling all resolve the effective config for a given file using the algorithm in §2.4.

---

## 4. Consumer Integration

Every consumer accepts `FormSpecConfig` as its primary configuration input.

### 4.1 Build API (`generateSchemas`)

To enable symbol-based detection of custom types (see §3.1.1), load the config with `loadFormSpecConfig` and pass the resolved `configPath` alongside `config`:

```typescript
import { loadFormSpecConfig } from "@formspec/config";

const { config, configPath } = await loadFormSpecConfig({ searchFrom: "./src" });

const result = generateSchemas({
  config,
  configPath,  // enables defineCustomType<T>() symbol-based detection
  filePath: "./src/config.ts",
  typeName: "DiscountConfig",
  errorReporting: "throw",
});
```

`configPath` is optional. When provided, the build pipeline includes the config file in the TypeScript program and walks its AST to extract type arguments from `defineCustomType<T>()` calls, resolving them to `ts.Symbol` instances for identity-based lookup. When omitted, only name-based and brand-based detection are available.

Per-call overrides can be passed alongside `config` and take precedence:

```typescript
generateSchemas({
  config,
  filePath,
  typeName,
  enumSerialization: "enum", // overrides config for this call
});
```

### 4.2 CLI

```bash
formspec generate src/config.ts DiscountConfig --config ./formspec.config.ts
```

Without `--config`, the CLI auto-discovers `formspec.config.ts` from cwd (see §5.3).

### 4.3 ESLint Plugin

```typescript
// eslint.config.ts
import formspec from "@formspec/eslint-plugin";
import config from "./formspec.config.ts";

export default [...formspec.withConfig(config).configs.recommended];
```

`withConfig` resolves the extension registry and makes it available to all rules. Rules use it to:

- Derive constraint applicability from extension capabilities
- Check `builtinConstraintBroadenings` before reporting type mismatches
- Recognize custom tags and annotations

Without `withConfig`, the plugin behaves as today — built-in constraints only.

### 4.4 Language Server

```typescript
import { createServer } from "@formspec/language-server";
import config from "./formspec.config.ts";

createServer({ config });
```

Uses extensions for tag completions, hover info, and diagnostic enrichment. Watches the config file for changes.

### 4.5 TypeScript Plugin

Config path via `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@formspec/ts-plugin",
        "configPath": "./formspec.config.ts"
      }
    ]
  }
}
```

---

## 5. Config File Convention

### 5.1 File Format

TypeScript module with a default export of `FormSpecConfig`:

```typescript
// formspec.config.ts
import { defineFormSpecConfig } from "@formspec/config";
import { defineCustomType, defineExtension } from "@formspec/core";
import type { Decimal } from "@stripe/extensibility-sdk/stdlib";

export default defineFormSpecConfig({
  extensions: [
    defineExtension({
      extensionId: "x-stripe/stdlib",
      types: [
        defineCustomType<Decimal>({
          typeName: "Decimal",
          brand: "__decimalBrand",
          toJsonSchema: () => ({ type: "string", format: "decimal" }),
        }),
      ],
    }),
  ],
});
```

The `defineCustomType<Decimal>(...)` call uses a type parameter to register the type. When `configPath` is supplied to the build API (§4.1), the pipeline resolves `Decimal` to its `ts.Symbol` for identity-based lookup. The `brand` field provides structural fallback detection when the config file is not included in the program.

### 5.2 File Names

Recognized in priority order:

1. `formspec.config.ts`
2. `formspec.config.mts`
3. `formspec.config.js`
4. `formspec.config.mjs`

### 5.3 Discovery

When a consumer auto-discovers (CLI, language server, TS plugin):

1. Start from the search directory (cwd for CLI, workspace root for LS/TS plugin)
2. Look for config file names in priority order
3. If not found, traverse to parent directory
4. Stop at filesystem root or `package.json` with `"workspaces"`
5. If no config file found, use FormSpec defaults

### 5.4 Loading

Config files are loaded using [`jiti`](https://github.com/unjs/jiti), a runtime TypeScript loader that supports ESM imports and TypeScript syntax without prior compilation. `jiti` is the same loader used by Vite, Nuxt, and Tailwind CSS for their TypeScript config files.

---

## 6. Migration

### 6.1 `.formspec.yml` → `formspec.config.ts`

The YAML config system has no users. It is replaced entirely:

- `@formspec/constraints` is renamed to `@formspec/config`
- `FormSpecConfig` type is expanded with `extensions`, `metadata`, `vendorPrefix`, `enumSerialization`
- `defineFormSpecConfig` and `loadFormSpecConfig` are added as new exports
- The YAML loader (`packages/constraints/src/loader.ts`) is replaced with a TypeScript file loader
- The `ConstraintConfig` type is unchanged — it becomes one field of the expanded `FormSpecConfig`

### 6.2 Per-Consumer Wiring → Config Object

**Before** (separate wiring per consumer):

```typescript
// Build
const defaults = { extensionRegistry, metadata, enumSerialization: "oneOf" };
function _generateSchemas(options) {
  return rawGenerateSchemas({ ...defaults, ...options });
}

// ESLint — no extension awareness
// Language server
createServer({ extensions: [stripeStdlibExtension] });
```

**After** (single config):

```typescript
// formspec.config.ts
export default defineFormSpecConfig({
  extensions: [stripeStdlibExtension],
  metadata: stripeMetadataPolicy,
  vendorPrefix: "x-stripe",
  enumSerialization: "oneOf",
});

// Build — no wrapper needed
generateSchemas({ config, filePath, typeName });

// ESLint — extension-aware
formspec.withConfig(config).configs.recommended;

// Language server
createServer({ config });
```

### 6.3 Deprecated APIs

| Deprecated                               | Replacement                                                    | Package                     |
| ---------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| `extensionRegistry` on `generateSchemas` | `config.extensions`                                            | `@formspec/build`           |
| `vendorPrefix` on `generateSchemas`      | `config.vendorPrefix`                                          | `@formspec/build`           |
| `enumSerialization` on `generateSchemas` | `config.enumSerialization`                                     | `@formspec/build`           |
| `metadata` on `generateSchemas`          | `config.metadata`                                              | `@formspec/build`           |
| `extensions` on `createServer`           | `config`                                                       | `@formspec/language-server` |
| `.formspec.yml` file format              | `formspec.config.ts`                                           | `@formspec/config`          |
| `loadConstraintConfig` (YAML loader)     | `loadFormSpecConfig`                                           | `@formspec/config`          |
| `tsTypeNames` on `CustomTypeRegistration` | `brand` field or `defineCustomType<T>()` type parameter       | `@formspec/core`            |

Deprecated APIs remain functional. Direct options override config when both are present.

---

## 7. Package Changes

### 7.1 Rename `@formspec/constraints` → `@formspec/config`

The existing `@formspec/constraints` package already owns `FormSpecConfig`, `ConstraintConfig`, the config loader, and the defaults. Renaming it to `@formspec/config` reflects its expanded role as the configuration system for the entire pipeline.

All existing exports (`ConstraintConfig`, `ResolvedConstraintConfig`, `ValidationIssue`, `ValidationResult`, `Severity`, `mergeWithDefaults`, `validateFormSpec`) remain unchanged — the rename is additive.

### 7.2 New Exports

```typescript
// Types (FormSpecConfig expanded with extensions, metadata, vendorPrefix, enumSerialization)
export type { FormSpecConfig } from "./types.js";

// Factory
export { defineFormSpecConfig } from "./define.js";

// TypeScript config file loader (replaces YAML loader)
export { loadFormSpecConfig } from "./loader.js";

// Config → ExtensionRegistry resolution
export { resolveExtensionRegistry } from "./resolve.js";
```

### 7.3 New Dependencies

- [`jiti`](https://github.com/unjs/jiti) — runtime TypeScript config file loading without prior compilation

### 7.4 Downstream Impact

All packages that depend on `@formspec/constraints` update their dependency to `@formspec/config`. Since the constraint types and APIs are re-exported unchanged, this is a mechanical rename with no code changes in consumers beyond `package.json` and import paths.

---

## 8. Resolved Design Questions

### DQ-1: Monorepo config model

**Decision:** Single root config with a `packages` map (§3.6). Glob patterns map to per-package overrides for `constraints`, `enumSerialization`, and `metadata`. Project-wide settings (`extensions`, `vendorPrefix`) are not overridable per package. Consumers resolve the effective config for a given file using the algorithm in §2.4.

### DQ-2: Runtime constraint validation

**Decision:** Validate `vendorPrefix` format (`x-*`) and `extensions` structure at config load time. Other fields are validated by their respective consumers.

### DQ-3: Config file caching

**Decision:** Cache with file-watcher invalidation. Config files change rarely; reloading on every access would be wasteful.
