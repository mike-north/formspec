# 004 — Lint & Language Server Architecture

> **Status:** Draft
> **Depends on:** [000-principles.md](./000-principles.md), [001-canonical-ir.md](./001-canonical-ir.md), [002-tsdoc-grammar.md](./002-tsdoc-grammar.md), [003-json-schema-vocabulary.md](./003-json-schema-vocabulary.md)
> **Covers:** Strategic workstream E (Tooling)

---

## 1. Overview

This document specifies the architecture of FormSpec's developer tooling layer: the ESLint plugin, the language server, the shared analysis pipeline that feeds both, and the diagnostic format that ties them together.

The tooling layer sits between the authoring surface (TSDoc tags, chain DSL) and the build pipeline (canonical IR → JSON Schema). Its job is to catch problems as early as possible — ideally while the author is still typing — and provide the completions, hover information, and navigational support that make TSDoc tag authoring feel like a first-class TypeScript editing experience.

### Principles Satisfied

| Principle                                           | How this document satisfies it                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A7** (clear linting vs. language server boundary) | ESLint owns all validation, error detection, and auto-fixes. The language server owns completions, hover, go-to-definition, and signature help. The boundary is architectural, not advisory       |
| **D1** (structured diagnostics)                     | Every FormSpec diagnostic carries source location, severity, machine-readable code, and human-readable message                                                                                    |
| **D2** (source-located diagnostics)                 | Diagnostics point to author source, not IR or generated output. Multi-source diagnostics (contradictions) reference all participating locations                                                   |
| **D3** (deterministic diagnostics)                  | The same input always produces the same diagnostic set in the same order. No non-deterministic map/set iteration                                                                                  |
| **D4** (actionable diagnostics)                     | Every diagnostic message explains what is wrong and what the author should do. Codes like `CONSTRAINT_CONTRADICTION` carry structured context (the conflicting values, both source locations)     |
| **D5** (auto-fixes when unambiguous)                | Rules offer auto-fixes only when intent is unambiguous. The confidence threshold is explicit: if more than one reasonable fix exists, the diagnostic describes the issue and defers to the author |
| **D6** (machine-consumable diagnostics)             | The diagnostic format supports LSP, SARIF, and ESLint's RuleTester. Structured codes enable filtering and aggregation in CI                                                                       |
| **PP9** (configurable surface area)                 | Every FormSpec diagnostic severity is overridable via project configuration. Rules can be set to `off`, `warn`, or `error` per project                                                            |
| **PP10** (white-labelable)                          | Diagnostic presentation is configurable for downstream organizations, while canonical machine-readable diagnostic codes remain stable symbolic identifiers                                           |
| **PP11** (consumer-controlled messaging)            | Diagnostic message templates are overridable via project configuration. Organizations can substitute their own terminology, instructional text, and style                                         |
| **E1** (built-in types use the same extension API)  | The ESLint rule infrastructure described here is the same API used by built-in rules. Extensions get tag-on-type validation, contradiction detection, and path-target resolution for free         |

### Relationship to Other Documents

- **001 (Canonical IR):** The shared analysis pipeline (§2) produces canonical IR nodes as output. All tooling consumes the IR, never the raw AST directly.
- **002 (TSDoc Grammar):** The diagnostic codes in §2 of this document correspond to the symbolic machine-readable codes defined in 002 §6. The tooling layer is the runtime enforcement point for those grammar rules.
- **003 (JSON Schema Vocabulary):** Extension rules (§4) follow the same extension registration model described in 003 §6.1 Outcome 4. A downstream consumer adding a `Decimal` type writes ESLint rules by expressing only extension-specific logic.

---

## 2. Shared Semantic Analysis Pipeline

Both ESLint and the language server need the same core analysis: parse TSDoc tags from a comment, resolve path/member targets against TypeScript types, detect constraint contradictions, and build provenance records. Rather than duplicating this logic in two places, it is extracted into a shared analysis pipeline that both consumers call.

### 2.1 Pipeline Position

The shared pipeline sits between the TypeScript AST and the consumers (ESLint rules, language server request handlers). It is not the same as the build-time pipeline described in 001 — this is an incremental, source-level analysis suitable for IDE and lint contexts, where full program builds are impractical for every keystroke.

```
TypeScript AST (via TypeScript compiler API)
        │
        ▼
┌───────────────────────────────────┐
│   Shared Semantic Analysis        │
│   Pipeline (§2)                   │
│                                   │
│   Phase 1: Comment extraction     │
│   Phase 2: Tag parsing            │
│   Phase 3: Type resolution        │
│   Phase 4: Constraint validation  │
└───────────────────────────────────┘
        │                   │
        ▼                   ▼
  ESLint rules        Language server
  (§3, §4)            request handlers (§5)
```

The pipeline output is a typed `AnalysisResult` — either a fully-analyzed field descriptor with IR nodes attached, or a partial result with parse errors that the consumer handles as diagnostics.

### 2.2 Phase 1: Comment Extraction

Given a TypeScript AST node (property declaration, class property, interface member), this phase:

1. Extracts the leading JSDoc/TSDoc comment block
2. Identifies all `@tag` entries in the comment
3. Preserves source positions (line, column, span) for each tag token and its arguments — this is the data that D2 requires

The extractor does not parse tag arguments at this stage. It produces a flat list of raw tag tokens with positions.

### 2.3 Phase 2: Tag Parsing

For each raw tag token, this phase:

1. Looks up the tag name in the registered tag inventory (built-in + extensions, per E1)
2. Applies the per-tag argument grammar (as specified in 002 §3)
3. Produces either a parsed `TagNode` or a `ParseError` with a symbolic diagnostic code
4. Respects the project's disabled-tag configuration (PP9), emitting `TAG_DISABLED` for disabled tags

The tag inventory is a registry, not a hard-coded list. Extension packages contribute entries at initialization time.

### 2.4 Phase 3: Type Resolution

This phase links each parsed tag to the TypeScript type it applies to:

1. Resolves the field's declared TypeScript type via the TypeScript compiler API
2. Checks tag applicability against the resolved type (producing `TYPE_MISMATCH`, per S4)
3. Resolves path-target (`:subfield`) and member-target (`:member`) modifiers:
   - Path-targets: look up the property on the field's object type; produce `UNKNOWN_PATH_TARGET` if absent
   - Member-targets: look up the member in the field's string literal union; produce `UNKNOWN_MEMBER_TARGET` if absent
4. Produces `UNSUPPORTED_TARGETING_SYNTAX` / `MEMBER_TARGET_ON_NON_UNION` for modifiers used on tags that do not accept them, or on incompatible types

The TypeScript compiler API is accessed via a shared `TypeResolutionContext` that both ESLint (which receives a `parserServices` TypeScript program) and the language server (which maintains its own TS program) provide.

### 2.5 Phase 4: Constraint Validation

This phase validates constraint composition across the resolved IR nodes:

1. Collects all `ConstraintNode` values for each (field, subfield?) pair
2. Runs contradiction detection for built-in constraint pairs (S2):
   - Numeric bounds: `@minimum` > `@maximum`, `@exclusiveMinimum` >= `@maximum`, etc.
   - String length: `@minLength` > `@maxLength`
   - Array length: `@minItems` > `@maxItems`
   - Rule effects: `@showWhen` + `@hideWhen` on same field; `@enableWhen` + `@disableWhen`
3. Checks for duplicate tags where only one instance is meaningful (producing `DUPLICATE_TAG`)
4. Checks for annotation conflicts (producing `DESCRIPTION_REMARKS_CONFLICT` for `@description` + `@remarks`)
5. Propagates constraints through the type inheritance chain when type context is available, detecting cross-type contradictions (producing `CONSTRAINT_CONTRADICTION` with both source locations per D2)

Extension-registered constraints participate in contradiction detection by declaring their contradiction predicate (see §4.2).

### 2.6 Pipeline TypeScript Interface

```typescript
/**
 * Context provided by the consumer (ESLint or language server).
 * Both surfaces supply their own TypeScript program and type checker.
 */
interface TypeResolutionContext {
  readonly program: import('typescript').Program;
  readonly checker: import('typescript').TypeChecker;
}

/**
 * The result of running the analysis pipeline on a single declaration node.
 */
interface AnalysisResult {
  /** The field's canonical IR node, if analysis completed without fatal errors. */
  readonly irNode: FieldNode | undefined;
  /** All diagnostics produced — parse errors, type mismatches, contradictions. */
  readonly diagnostics: readonly FormSpecDiagnostic[];
  /** Raw parsed tags, even if some produced errors. Used by the language server. */
  readonly parsedTags: readonly ParsedTag[];
  /** The resolved TypeScript type of the field, used by language server hover. */
  readonly resolvedType: import('typescript').Type | undefined;
}

/**
 * Run the four-phase analysis pipeline for a single TypeScript declaration node.
 * Both ESLint rules and language server handlers call this function.
 */
declare function analyzeDeclaration(
  node: import('typescript').Declaration,
  context: TypeResolutionContext,
  config: FormSpecConfig
): AnalysisResult;
```

The pipeline is pure and stateless per invocation — no ambient configuration, no cross-call state (per A3). ESLint calls it once per relevant AST node during a lint run; the language server calls it incrementally as the user edits.

---

## 3. ESLint Rule Architecture

Per A7, ESLint owns all validation and auto-fix logic. The `@formspec/eslint-plugin` package provides a comprehensive rule set organized into categories that mirror the 002 §6 diagnostic code categories.

### 3.1 Rule Categories

Each rule category maps directly to a diagnostic category from 002 §6:

| Rule category           | Diagnostic families                                                  | Responsibility                                    |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `tag-recognition`       | `UNKNOWN_TAG`, `MISSING_TAG_ARGUMENT`, `TAG_DISABLED`                | Unknown tags, missing arguments, disabled tags    |
| `value-parsing`         | `INVALID_NUMERIC_VALUE`, `INVALID_NON_NEGATIVE_INTEGER`, related     | Malformed numeric, regex, JSON, and date values   |
| `type-compatibility`    | `TYPE_MISMATCH`                                                      | Tags applied to incompatible field types          |
| `target-resolution`     | `UNKNOWN_PATH_TARGET`, `UNKNOWN_MEMBER_TARGET`, related              | Invalid path-target and member-target references  |
| `constraint-validation` | `CONSTRAINT_CONTRADICTION`, `DUPLICATE_TAG`, related                 | Contradictions, duplicates, rule effect conflicts |

Rules within each category are named `formspec/<category>/<specific-rule>`, for example:

- `formspec/constraint-validation/no-contradictions`
- `formspec/type-compatibility/tag-type-check`
- `formspec/target-resolution/valid-path-target`

### 3.2 How Rules Consume the IR

Every FormSpec ESLint rule follows the same pattern: it registers an AST visitor for TypeScript declaration nodes, calls `analyzeDeclaration` from the shared pipeline (§2), and reports diagnostics from the `AnalysisResult`.

Rules do not parse TSDoc themselves. They do not call the TypeScript compiler API directly for tag-related lookups. All of that lives in the shared pipeline — rules only interpret the `AnalysisResult`.

```typescript
import type { Rule } from 'eslint';
import { analyzeDeclaration } from '@formspec/build/analysis';

/**
 * Example built-in rule: reports constraint contradictions (`CONSTRAINT_CONTRADICTION`).
 * The rule is thin — all analysis lives in the pipeline.
 */
const noContradictions: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      contradiction: '{{ message }}',
    },
  },
  create(context) {
    const parserServices = context.parserServices;
    const tsContext: TypeResolutionContext = {
      program: parserServices.program,
      checker: parserServices.getTypeChecker(),
    };

    return {
      // Visit all TypeScript property/member declarations
      'PropertyDeclaration, PropertySignature'(node) {
        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
        const result = analyzeDeclaration(tsNode, tsContext, getConfig(context));

        for (const diag of result.diagnostics) {
          if (diag.category !== 'constraint-validation') continue;

          context.report({
            node,
            messageId: 'contradiction',
            data: { message: diag.message },
            // Auto-fixes are attached by the diagnostic itself (see §7)
            fix: diag.fix ? (fixer) => applyFormSpecFix(fixer, diag.fix!) : undefined,
          });
        }
      },
    };
  },
};
```

### 3.3 Built-In Rule Set

The built-in rules cover all diagnostic codes defined in 002 §6. They are grouped into the recommended configuration (`formspec/recommended`) and a stricter configuration (`formspec/strict`) that upgrades configurable warnings to errors.

**`formspec/recommended` rule set:**

| Rule                                            | Codes                                           | Default severity |
| ----------------------------------------------- | ------- | ---------------- |
| `tag-recognition/no-unknown-tags`               | `UNKNOWN_TAG`                                   | warn             |
| `tag-recognition/require-tag-arguments`         | `MISSING_TAG_ARGUMENT`                          | error            |
| `tag-recognition/no-disabled-tags`              | `TAG_DISABLED`                                  | warn             |
| `value-parsing/valid-numeric-value`             | `INVALID_NUMERIC_VALUE`                         | error            |
| `value-parsing/valid-integer-value`             | `INVALID_NON_NEGATIVE_INTEGER`                  | error            |
| `value-parsing/valid-regex-pattern`             | `INVALID_REGEX_PATTERN`                         | error            |
| `value-parsing/valid-json-value`                | `INVALID_JSON_VALUE`                            | error            |
| `type-compatibility/tag-type-check`             | `TYPE_MISMATCH`                                 | error            |
| `target-resolution/valid-path-target`           | `UNKNOWN_PATH_TARGET`                           | error            |
| `target-resolution/valid-member-target`         | `UNKNOWN_MEMBER_TARGET`                         | error            |
| `target-resolution/no-unsupported-targeting`    | `UNSUPPORTED_TARGETING_SYNTAX`                  | error            |
| `target-resolution/no-member-target-on-object`  | `MEMBER_TARGET_ON_NON_UNION`                    | error            |
| `constraint-validation/no-contradictions`       | `CONSTRAINT_CONTRADICTION`                      | error            |
| `constraint-validation/no-duplicate-tags`       | `DUPLICATE_TAG`                                 | warn             |
| `constraint-validation/no-description-conflict` | `DESCRIPTION_REMARKS_CONFLICT`                  | info             |
| `constraint-validation/no-contradictory-rules`  | `CONTRADICTORY_RULES`                           | error            |

### 3.4 Rule Configuration Interface

Per PP9, every rule's severity is overridable in the project's ESLint configuration. Per PP11, message templates are overridable in `.formspec.yml`.

`@formspec/eslint-plugin` ships a recommended flat config for easy adoption. Consumers import it directly into `eslint.config.js` without manually listing plugins or rules:

```typescript
// In the consumer's eslint.config.js — minimal setup using the recommended flat config
import formspec from '@formspec/eslint-plugin';

export default [
  // Spread the recommended config to enable all built-in rules at their default severities
  ...formspec.configs.recommended,
];
```

Rules can then be adjusted individually:

```typescript
// In the consumer's eslint.config.js
import formspec from '@formspec/eslint-plugin';

export default [
  ...formspec.configs.recommended,
  {
    rules: {
      // Override a specific rule's severity
      'formspec/tag-recognition/no-unknown-tags': 'error',
      // Disable a rule entirely
      'formspec/constraint-validation/no-duplicate-tags': 'off',
    },
  },
];
```

For message template overrides (PP11), the consumer configures them in `.formspec.yml`:

```yaml
# .formspec.yml
diagnostics:
  messages:
    UNKNOWN_TAG: 'Unrecognized tag "@{tagName}". Valid tags: {validTags}.'
    CONSTRAINT_CONTRADICTION: 'Conflicting constraints detected: {details}'
```

Message templates use `{placeholder}` syntax. The available placeholders for each code are documented in 002 §6 and are part of the stable public API.

---

## 4. Extension-Driven ESLint Rules

Per E1, built-in types use the same extension API. This section describes how extensions integrate with the ESLint rule infrastructure. The canonical API shapes (`defineExtension`, `defineConstraintTag` from `@formspec/core`) are specified in 005 §4; this section explains how that API interacts with ESLint validation.

The design goal is Outcome 4 from 003 §6.1: **extension authors express only extension-specific logic**. FormSpec provides the foundational infrastructure — tag-on-type validation, contradiction detection for set-influencing constraints, path-target resolution, provenance tracking — so the extension only declares what is new.

### 4.1 How Extensions Declare Tag Applicability

Extensions declare their constraint tags using `defineConstraintTag` from `@formspec/core` inside a `defineExtension` call (see 005 §4 for the full API shape). The `defineConstraintTag` registration is the authoritative source for everything the shared analysis pipeline needs:

- `applicableTypes` — which TypeScript types the tag may appear on (enforced as `TYPE_MISMATCH`)
- `valueParser` — validates and parses the tag's argument (failure emits the appropriate symbolic parse code)
- `contradictionCheck` — predicate called for all constraint pairs; returning a non-null result produces `CONSTRAINT_CONTRADICTION`
- `composition` — determines duplicate semantics: `"intersection"` tags with the same target produce `DUPLICATE_TAG`

The analysis pipeline reads these declarations automatically. Extension authors do **not** write custom ESLint rules for type applicability, value parsing, or contradiction detection — those diagnostics are emitted by the built-in rules whenever a registered tag violates its own declared constraints.

For example, a `@maxSigFig` tag declared with `applicableTypes: ["Decimal"]` automatically produces `TYPE_MISMATCH` if the author applies it to a `number` field. No extension rule code is required for that check.

### 4.2 ESLint Rule Infrastructure for Extension-Specific Logic

Extensions write ESLint rules only for domain logic that goes beyond what `defineConstraintTag` can express declaratively. The `createConstraintTagRule` factory from `@formspec/eslint-plugin/base` handles all the boilerplate (tag location extraction, type applicability, path-target resolution, provenance attachment, diagnostic emission per D1–D4); the extension provides only the domain-specific predicate:

```typescript
import { createConstraintTagRule } from '@formspec/eslint-plugin/base';

// This rule validates @maxSigFig usage beyond what defineConstraintTag declares.
// It does NOT need to re-implement type resolution, path-target syntax,
// provenance tracking, or contradiction detection — the pipeline handles those.
export const maxSigFigRule = createConstraintTagRule({
  tag: '@maxSigFig',
  applicableTypes: ['Decimal'],
  valueParser: parsePositiveInt,
  contradictionCheck: (accumulated, proposed) =>
    proposed > accumulated
      ? `@maxSigFig ${proposed} cannot broaden inherited @maxSigFig ${accumulated}`
      : null,
});
```

Extension rules receive an `AnalysisResult` from the shared pipeline. Tags that already produced pipeline diagnostics (`TYPE_MISMATCH`, `UNKNOWN_PATH_TARGET`, etc.) are excluded from the result — the extension only sees tags that passed all pipeline phases and are ready for domain-level inspection.

### 4.3 What Extensions Get for Free

By declaring a tag via `defineConstraintTag` (see 005 §4), an extension gets the following without writing any rule code:

| Capability                                      | Mechanism                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Parse error reporting (`INVALID_*`)                  | `valueParser` declaration → pipeline runs the right parser                           |
| Type applicability checking (`TYPE_MISMATCH`)       | `applicableTypes` declaration → pipeline checks tag against field type               |
| Path-target validation (`UNKNOWN_PATH_TARGET`, related) | Pipeline resolves `:subfield` modifiers; produces errors for unknown properties  |
| Member-target validation (`UNKNOWN_MEMBER_TARGET`, related) | Pipeline validates `:member` references against string literal union members |
| Contradiction detection (`CONSTRAINT_CONTRADICTION`) | `contradictionCheck` predicate → pipeline compares constraint pairs                  |
| Duplicate detection (`DUPLICATE_TAG`)              | `composition: "intersection"` on same target → pipeline emits duplicate warning      |
| Provenance tracking (S3, D2)                    | Pipeline records source location for every constraint node automatically        |

The extension rule only needs to express logic that is genuinely specific to its domain.

---

## 5. Language Server Responsibilities

Per A7, the language server owns the authoring experience: completions, hover, go-to-definition, and signature help. It does not duplicate ESLint's validation logic — diagnostics from TSDoc tag errors are ESLint's responsibility.

The language server is implemented as a TypeScript Language Service Plugin (the standard mechanism for extending VS Code's TypeScript language service). This means it activates automatically when `@formspec/language-server` is installed and listed in `tsconfig.json`'s `plugins` array — no separate server process, no separate extension installation for VS Code users.

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [{ "name": "@formspec/language-server" }]
  }
}
```

### 5.1 Tag Name Completions

When the cursor is inside a TSDoc comment block and the author begins typing `@`, the language server offers completions for all registered FormSpec tags. The completion list is derived from the same tag inventory used by the ESLint pipeline — extensions registered via E5 appear automatically.

Completion items include:

- The tag name with the leading `@`
- A brief description (taken from the tag's documentation in the registry)
- A snippet template for the tag's required arguments (e.g., `@minimum ${1:value}`)
- The tag's applicability information (shown in the completion detail: "Applies to: number")

The completion list is filtered based on the field's TypeScript type at the cursor position. If the author is in the comment for a `string` field, `@minimum` is not offered (it is only applicable to `number` in core FormSpec). This filtering surfaces the right subset of tags for the current context (S4, PP2).

### 5.2 Path-Target Completions

When the author types `@minimum :` (or any constraint tag followed by `:`) inside a comment on a complex-typed field, the language server offers completions for the field's property names.

For example, on a field of type `MonetaryAmount { value: number; currency: string }`:

- `@minimum :` → offers `:value` and `:currency`
- After selecting `:value`, the list is further filtered to show only tags applicable to `number`

For string literal union fields, the same `:` trigger offers member names for tags that accept member-target syntax (§5 in 002):

- On `'draft' | 'sent' | 'paid'`, `@displayName :` → offers `:draft`, `:sent`, `:paid`

This completion is particularly valuable because path-target identifiers must exactly match property names — a typo produces `UNKNOWN_PATH_TARGET`. Completions eliminate the typo source (A7: completions are an authoring-experience concern, not a validation concern).

### 5.3 Hover Information

When the author hovers over a FormSpec tag, the language server displays:

1. **Tag documentation:** A brief description of what the tag does, copied from the tag registry's `documentation` field. This is the same documentation that appears in completion items.

2. **Constraint provenance:** For constraint tags, the language server shows where the effective constraint was inherited from — particularly useful when the constraint comes from a base type and the current declaration does not declare it directly. This surfaces S3 (constraint provenance) in the IDE.

   ```
   @minimum 0
   Inherited from: USDCents → Integer → number
   Declared at: src/types/monetary.ts:12:4
   ```

3. **Current effective value:** When a field's type has multiple constraints on the same property (from the field itself and from type inheritance), hover shows the composed effective constraint, not just the locally-declared one.

4. **Conflict warnings:** If a constraint is in contradiction with another (the same pair that `CONSTRAINT_CONTRADICTION` reports in ESLint), hover shows a warning indicator and links to the conflicting location. This gives authors immediate feedback without requiring a full lint run.

### 5.4 Go-to-Definition

The language server provides go-to-definition for two FormSpec-specific constructs:

**`{@link TypeRef}` in `@showWhen`/`@hideWhen`/`@enableWhen`/`@disableWhen`:**

Per 002 §3.2, conditional tags use `{@link}` to reference a condition type. The TSDoc `{@link}` syntax already has IDE support for navigating to the referenced type — the language server ensures that FormSpec-specific condition types participate in this navigation correctly. No additional implementation is required for this case; it is handled by the TypeScript language service's existing `{@link}` support.

**Tag name references in `.formspec.yml`:**

When the author has configured disabled tags or message overrides in `.formspec.yml` and the language server provides YAML support, tag names in configuration are resolvable to their registry declarations. This is a lower-priority capability and may be deferred to a follow-on release.

### 5.5 Signature Help

When the author is inside a tag's argument position (the text after the tag name), the language server provides signature help — the same mechanism that shows function parameter hints for TypeScript function calls.

The signature help for a tag shows:

- The expected argument syntax (from the grammar defined in 002 §3)
- The argument description
- Whether the argument is required or optional
- For tags with path/member-target syntax: an indicator that `:propertyName` can precede the value

Example: when the cursor is on `@minimum `, signature help shows:

```
@minimum [:subfield] <number>
                     ^^^^^^^^
A finite number. May be preceded by :subfield to target a property
of a complex type (e.g., @minimum :value 0).
```

### 5.6 Diagnostics and the Language Server

The FormSpec language server does **not** re-run the analysis pipeline for diagnostics and does not produce its own validation errors. Per A7, all validation and diagnostic emission is ESLint's responsibility. Editors surface FormSpec diagnostics through their ESLint language server integration (e.g., the vscode-eslint extension), not through the FormSpec language server.

The FormSpec LS responsibilities are strictly:

- **Completions:** tag names (filtered by field type), path-target field names, string-literal union member names (§5.1–§5.2)
- **Go-to-definition:** `{@link}` type references in `@showWhen`/`@hideWhen`/`@enableWhen`/`@disableWhen` (§5.4)
- **Hover:** tag documentation, constraint provenance, effective composed value (§5.3)
- **Signature help:** expected tag arguments, argument descriptions, path/member-target indicator (§5.5)

Source-level diagnostics — tag recognition, value parsing, type compatibility, target resolution, constraint validation — are handled exclusively through ESLint. Post-generation output validation (e.g., JSON Schema + UI Schema consistency checks) may warrant a future CLI command, but that is distinct from source-level authoring feedback.

---

## 6. Diagnostic Format

### 6.1 Code Structure

All FormSpec diagnostics use stable symbolic machine-readable codes such as:

- `UNKNOWN_TAG`
- `TYPE_MISMATCH`
- `UNKNOWN_PATH_TARGET`
- `UNKNOWN_MEMBER_TARGET`
- `CONSTRAINT_CONTRADICTION`

Branding belongs in displayed messages and surrounding tooling presentation, not in the canonical `code` field.

### 6.2 Structured Diagnostic Type

```typescript
/**
 * A structured FormSpec diagnostic. Satisfies D1 (structured), D2 (source-located),
 * D3 (deterministic — codes and messages are deterministic functions of the input),
 * D4 (actionable), D5 (fix when unambiguous), D6 (machine-consumable).
 */
interface FormSpecDiagnostic {
  /**
   * The machine-readable code, e.g., "CONSTRAINT_CONTRADICTION".
   * Category is one of: tag-recognition, value-parsing, type-compatibility,
   * target-resolution, constraint-validation.
   */
  readonly code: string;

  /**
   * The category string corresponding to the code prefix.
   */
  readonly category:
    | 'tag-recognition'
    | 'value-parsing'
    | 'type-compatibility'
    | 'target-resolution'
    | 'constraint-validation';

  /**
   * The diagnostic severity. Configurable per PP9.
   */
  readonly severity: 'error' | 'warning' | 'info';

  /**
   * The human-readable message. Overridable via PP11.
   * Message templates are expanded with contextual data at report time.
   */
  readonly message: string;

  /**
   * The primary source location: the file and span of the offending tag or value.
   * Always present (D2).
   */
  readonly location: SourceLocation;

  /**
   * Additional source locations for multi-source diagnostics (e.g., `CONSTRAINT_CONTRADICTION`
   * contradiction, which involves two constraints at potentially different locations).
   * The first entry is the "other" constraint; the second and beyond are context.
   * May be empty.
   */
  readonly relatedLocations: readonly SourceLocation[];

  /**
   * An auto-fix, present only when the resolution is unambiguous (D5).
   * Absent when multiple reasonable fixes exist — the message explains the issue
   * and defers to the author.
   */
  readonly fix: DiagnosticFix | undefined;

  /**
   * Structured data for machine consumption (D6). Contains the raw values that
   * the message template was expanded from — tag names, type names, conflicting
   * values, etc.
   */
  readonly data: Record<string, string | number | readonly string[]>;
}

interface SourceLocation {
  readonly file: string; // Absolute path
  readonly line: number; // 1-indexed
  readonly column: number; // 0-indexed
  readonly endLine: number;
  readonly endColumn: number;
}

interface DiagnosticFix {
  /** Short description of what the fix does, shown in IDEs. */
  readonly description: string;
  /** The text changes to apply. */
  readonly changes: readonly TextChange[];
}

interface TextChange {
  readonly file: string;
  readonly range: { start: number; end: number }; // Character offsets
  readonly newText: string;
}
```

### 6.3 SARIF Compatibility

For CI integration (D6), FormSpec diagnostics serialize to SARIF 2.1.0. The mapping is:

| FormSpec field        | SARIF field                                              |
| --------------------- | -------------------------------------------------------- |
| `code`                | `result.ruleId`                                          |
| `severity: "error"`   | `result.level: "error"`                                  |
| `severity: "warning"` | `result.level: "warning"`                                |
| `severity: "info"`    | `result.level: "note"`                                   |
| `message`             | `result.message.text`                                    |
| `location`            | `result.locations[0].physicalLocation`                   |
| `relatedLocations`    | `result.relatedLocations`                                |
| `data`                | `result.message.arguments` (for template-based messages) |
| `fix.changes`         | `result.fixes[0].artifactChanges`                        |

The SARIF output is emitted via `@formspec/eslint-plugin`'s formatter, which is compatible with GitHub Actions' native SARIF upload action and any SARIF-aware CI system.

### 6.4 LSP Diagnostic Integration

For IDE display (D6), the language server maps `FormSpecDiagnostic` to the LSP `Diagnostic` type:

```typescript
function toLanguageServerDiagnostic(
  diag: FormSpecDiagnostic
): import('vscode-languageclient').Diagnostic {
  return {
    range: sourceLocationToRange(diag.location),
    severity: severityToLSP(diag.severity),
    code: diag.code,
    source: 'formspec',
    message: diag.message,
    relatedInformation: diag.relatedLocations.map((loc, i) => ({
      location: { uri: fileUri(loc.file), range: sourceLocationToRange(loc) },
      message: `Related location ${i + 1}`,
    })),
    data: { fix: diag.fix, rawData: diag.data },
  };
}
```

The `data` field carries the `fix` payload for use by LSP code action requests — this is how "quick fix" suggestions appear in VS Code's light bulb menu.

---

## 7. Auto-Fix Architecture

### 7.1 When to Offer Fixes

Fixes are offered only when the intent is unambiguous and the transformation is purely mechanical (D5). The guiding question is: "Is there exactly one reasonable thing the author should do here?"

| Scenario                                                  | Fix offered?                     | Rationale                                        |
| --------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| Unknown tag with close match (edit distance ≤ 2)          | Yes — rename to the matched tag  | Only one plausible intent                        |
| Disabled tag present                                      | Yes — remove the tag             | Only one valid action: remove it                 |
| Float passed to integer-only tag (e.g., `@minLength 1.0`) | Yes — truncate to `1`            | Clearly a formatting mistake                     |
| Duplicate tag (`DUPLICATE_TAG`) — second instance wins    | Yes — remove first               | Composition rule is clear (C1)                   |
| `@description` + `@remarks` conflict (`DESCRIPTION_REMARKS_CONFLICT`) | Yes — remove `@remarks` | `@description` always wins per C1                |
| Unknown path-target with close match (≤ 2 edits)          | Yes — rename to matched property | Only one plausible property                      |
| Constraint contradiction (`CONSTRAINT_CONTRADICTION`)     | No                               | The author must decide which constraint is wrong |
| Tag applied to wrong type (`TYPE_MISMATCH`)               | No                               | The author must change the field type or the tag |
| Missing required argument (`MISSING_TAG_ARGUMENT`)        | No                               | The intent (which value?) is unknown             |

### 7.2 ESLint Fixer

Auto-fixes that modify source code go through ESLint's `RuleFixer` API. This ensures fixes are applied correctly when the author runs `eslint --fix` from the CLI or triggers a fix-all action in their editor.

```typescript
/**
 * Converts a FormSpecDiagnostic's fix into an ESLint RuleFix.
 * Called from the rule's create() function when building the report.
 */
function applyFormSpecFix(
  fixer: import('eslint').Rule.RuleFixer,
  fix: DiagnosticFix
): import('eslint').Rule.Fix | import('eslint').Rule.Fix[] {
  return fix.changes.map((change) =>
    fixer.replaceTextRange([change.range.start, change.range.end], change.newText)
  );
}
```

Fixes produced by the pipeline are file-and-range based (using character offsets) so they translate directly to ESLint's `replaceTextRange`. No AST manipulation is required — TSDoc tags are in comment text, where text replacement is the correct operation.

### 7.3 Language Server Code Actions

The same `fix` payload from `FormSpecDiagnostic` is also surfaced as an LSP `CodeAction` (a "quick fix") when the editor requests code actions for a diagnostic range. The language server code action handler converts `DiagnosticFix.changes` into LSP `WorkspaceEdit` entries.

```typescript
/**
 * Converts a DiagnosticFix into an LSP WorkspaceEdit for the code action response.
 */
function toWorkspaceEdit(
  fix: DiagnosticFix
): import('vscode-languageserver').WorkspaceEdit {
  const changes: Record<string, import('vscode-languageserver').TextEdit[]> = {};

  for (const change of fix.changes) {
    const uri = fileUri(change.file);
    changes[uri] ??= [];
    changes[uri].push({
      range: offsetRangeToLSPRange(change.range),
      newText: change.newText,
    });
  }

  return { changes };
}
```

This means fixes authored in the pipeline (e.g., "remove the `@remarks` tag") work identically from `eslint --fix` on the command line and from the light bulb menu in VS Code — the same `DiagnosticFix` data drives both.

### 7.4 Bulk Fix Support

ESLint's `--fix` flag applies all auto-fixable diagnostics in a single pass. FormSpec's rule infrastructure ensures fixes from different rules do not conflict (they operate on disjoint source ranges — each tag occupies a unique span). When ESLint applies multiple fixes simultaneously, the result is correct.

The language server supports "Fix All" actions via the `source.fixAll.formspec` code action kind. This triggers the same ESLint fix pass programmatically, using the file's current content rather than the on-disk version. The result is presented as a diff for the author to accept.

---

## 8. Configuration

### 8.1 Diagnostic Branding (PP10)

Diagnostic branding is configurable in `.formspec.yml`, but it does not change the canonical machine-readable `code`. It affects displayed message wrappers, help links, and organization-specific presentation.

### 8.2 Per-Rule Severity Overrides (PP9)

Severity overrides live in ESLint configuration (the standard ESLint mechanism), not in `.formspec.yml`. This maintains compatibility with existing ESLint tooling and avoids a parallel configuration system.

```javascript
// eslint.config.js
export default [
  {
    plugins: { formspec },
    rules: {
      // Using the recommended preset, then adjusting specific rules
      ...formspec.configs.recommended.rules,

      // Upgrade a warning to an error for this project
      'formspec/tag-recognition/no-unknown-tags': 'error',

      // Downgrade an error to a warning (e.g., during migration)
      'formspec/type-compatibility/tag-type-check': 'warn',

      // Disable a rule entirely
      'formspec/constraint-validation/no-duplicate-tags': 'off',
    },
  },
];
```

### 8.3 Message Templates (PP11)

Diagnostic message templates are overridable in `.formspec.yml`. Templates use `{placeholder}` syntax. Available placeholders for each code are part of the public API (documented alongside each code in 002 §6).

```yaml
# .formspec.yml
diagnostics:
  messages:
    # Override the unknown-tag message to match internal documentation style
    UNKNOWN_TAG: >
      "@{tagName}" is not a recognized annotation in this project.
      See go/formspec-tags for the complete tag reference.

    # Override the contradiction message to reference internal runbooks
    CONSTRAINT_CONTRADICTION: >
      Constraint conflict: {details}.
      To resolve, see go/formspec-constraint-conflicts.
```

Template overrides apply to both ESLint rule reports and language server hover/diagnostic display. The same message the author sees in their editor is the same message CI reports — PP11's "consumer-controlled messaging" applies uniformly across all delivery surfaces.

### 8.4 Disabled Tags (PP9)

Tags can be disabled project-wide in `.formspec.yml`. Disabled tags that appear in source produce `TAG_DISABLED` at the configured severity (default `warn`):

```yaml
# .formspec.yml
tags:
  disabled:
    - maxSigFig # This project does not use decimal precision constraints
    - before # This project has no date-bounded fields
    - after
```

Disabling a tag removes it from language server completions — the author will not be offered a tag that would immediately produce a lint warning. This implements PP9's intent: authors working within a constrained profile should not feel like they are fighting a library that tries to enable too much.

### 8.5 Extension Configuration

Extensions can declare configuration keys that appear under the `extensions:` namespace in `.formspec.yml`. The extension receives its configuration block at initialization and can use it to parameterize both the tag registry entries and the ESLint rules.

```yaml
# .formspec.yml — consumer's configuration of a hypothetical decimal extension
extensions:
  decimal:
    maxSigFigUpperLimit: 38 # Passed to the extension at initialization
    precisionLoss: 'error' # B3 — configurable lossy transformation policy
```

This enables the Outcome 8 scenario from 003 §6.1 without requiring the extension to define its own configuration file or parsing logic.

---

## Appendix A: Diagnostic Category Quick Reference

| Category              | Representative symbolic codes                               | Responsibility                                    |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Tag recognition       | `UNKNOWN_TAG`, `MISSING_TAG_ARGUMENT`, `TAG_DISABLED`       | Unknown tags, missing arguments, disabled tags    |
| Value parsing         | `INVALID_NUMERIC_VALUE`, `INVALID_REGEX_PATTERN`, related   | Malformed numeric, regex, JSON, and date values   |
| Type compatibility    | `TYPE_MISMATCH`                                             | Tags applied to incompatible field types          |
| Target resolution     | `UNKNOWN_PATH_TARGET`, `UNKNOWN_MEMBER_TARGET`, related     | Invalid path-target and member-target references  |
| Constraint validation | `CONSTRAINT_CONTRADICTION`, `DUPLICATE_TAG`, related        | Contradictions, duplicates, rule effect conflicts |

See 002 §6 for the individual diagnostic code definitions.

---

## Appendix B: ESLint vs. Language Server Responsibility Matrix

| Capability                        | ESLint        | Language Server           | Notes                                                 |
| --------------------------------- | ------------- | ------------------------- | ----------------------------------------------------- |
| Parse error detection             | Yes           | No                        | ESLint only; surfaced in editor via vscode-eslint     |
| Type applicability checking       | Yes           | No                        | ESLint rule `tag-type-check`                          |
| Contradiction detection           | Yes           | No                        | ESLint only; surfaced in editor via vscode-eslint     |
| Auto-fix application              | Yes (`--fix`) | Yes (code action)         | Same `DiagnosticFix` payload drives both              |
| Tag name completions              | No            | Yes                       | LS-only authoring experience (A7)                     |
| Path/member-target completions    | No            | Yes                       | LS-only authoring experience (A7)                     |
| Hover (tag docs, provenance)      | No            | Yes                       | Requires cursor position                              |
| Go-to-definition (`{@link}`)      | No            | Yes                       | TypeScript LS handles; FormSpec ensures participation |
| Signature help                    | No            | Yes                       | Requires cursor position and incremental state        |
| Bulk fix (fix-all)                | Yes           | Yes (delegates to ESLint) | LS `source.fixAll.formspec` action                    |

The asymmetry is intentional (A7): if a capability requires cursor position, incremental typing state, or live feedback during composition, it belongs in the language server. Everything else belongs in ESLint where it can run in CI without an editor.
