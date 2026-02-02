# FormSpec DX Improvement Proposal

**Goal:** Raise all DX evaluation scores to 9/10 or above

**Current Scores:**
| Scenario | Score | Key Blockers |
|----------|-------|--------------|
| Chain DSL build-time | ~7-8/10 | Validation inconsistency, CLI .ts support |
| Decorator CLI build-time | ~9/10 | Minor polish items |
| Chain DSL runtime | 7/10 | Umbrella package, ESM docs |
| Decorator runtime | 8/10 | @Group inconsistency, multiple output formats |
| Dynamic resolvers | 7.5/10 | API naming, type safety gaps |

---

## Priority 1: Critical (Blocking Getting Started)

### P1-1: Fix Umbrella `formspec` Package

**Issue:** The `formspec` package on npm is an empty placeholder (v0.0.0), but README instructs `npm install formspec`.

**Impact:** 3/5 evaluations hit this - complete failure to follow documentation.

**Solution:** Publish a real umbrella package that re-exports all sub-packages:

```typescript
// packages/formspec/src/index.ts
export * from "@formspec/core";
export * from "@formspec/dsl";
export * from "@formspec/build";
export * from "@formspec/runtime";
```

**Files to modify:**
- `packages/formspec/src/index.ts` - Add re-exports
- `packages/formspec/package.json` - Add dependencies on sub-packages

**Effort:** Small (1-2 hours)

---

### P1-2: Add ESM Requirements to Main README

**Issue:** Packages are ESM-only but main README doesn't mention `"type": "module"` requirement. Users see confusing `ERR_PACKAGE_PATH_NOT_EXPORTED` errors.

**Impact:** 2/5 evaluations hit this.

**Solution:** Add Requirements section to the monorepo root README:

```markdown
## Requirements

FormSpec packages are ESM-only. Your project must be configured for ES modules:

**package.json:**
```json
{
  "type": "module"
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```
```

**Files to modify:**
- Root `README.md` (create if needed, or add to existing docs)

**Effort:** Tiny (30 minutes)

---

## Priority 2: High (Significant DX Issues)

### P2-1: Fix Validation API Consistency

**Issue:** Three validation behaviors are inconsistent:
1. `validateForm()` returns `valid: true` even with duplicate field names
2. `formspecWithValidation({ validate: "warn" })` correctly warns
3. `formspecWithValidation({ validate: "throw" })` does NOT throw

**Impact:** False confidence in form validity; confusion about API behavior.

**Solution:**
1. Make `validateForm()` detect duplicates
2. Make `validate: "throw"` actually throw when issues found
3. Add compile-time duplicate detection via TypeScript (stretch goal)

**Files to modify:**
- `packages/dsl/src/validation.ts`
- `packages/dsl/src/structure.ts` (formspecWithValidation)

**Effort:** Medium (4-6 hours)

---

### P2-2: Fix @Group Decorator Inconsistency

**Issue:** `@Group` decorator behaves differently:
- `buildFormSchemas()` - Groups are ignored (flat layout)
- CLI `generate` - Groups appear as property on each field

**Impact:** Confusing for developers expecting visual field grouping.

**Solution:** Implement JSON Forms `GroupLayout` in `buildFormSchemas()` output:

```json
{
  "type": "Group",
  "label": "Personal Info",
  "elements": [
    { "type": "Control", "scope": "#/properties/name" },
    { "type": "Control", "scope": "#/properties/email" }
  ]
}
```

**Files to modify:**
- `packages/decorators/src/index.ts` (buildFormSchemas function)

**Effort:** Medium (3-4 hours)

---

### P2-3: Detect Unexported Classes in Codegen

**Issue:** When a decorated class is not exported, codegen generates code that tries to import it, causing TypeScript compilation errors.

**Impact:** Developers must debug why generated code won't compile.

**Solution:** Add check during codegen that validates all decorated classes are exported. Emit warning or error if not.

**Files to modify:**
- `packages/cli/src/codegen/index.ts`

**Effort:** Small (2 hours)

---

### P2-4: Add CLI TypeScript Support (or Fix Docs)

**Issue:** CLI help shows `.ts` file examples but doesn't support TypeScript directly:
```
Error: Unknown file extension ".ts"
```

**Solution Options:**
1. **Option A:** Bundle `tsx` for transparent TypeScript support
2. **Option B:** Update help text to show `.js` files and document the compile step

**Recommendation:** Option A is better DX, Option B is faster to implement.

**Files to modify:**
- `packages/cli/package.json` (add tsx dependency)
- `packages/cli/src/index.ts` (use tsx for loading)
- OR: Update help text in CLI

**Effort:** Small (Option B: 1 hour) or Medium (Option A: 3-4 hours)

---

## Priority 3: Medium (Polish Items)

### P3-1: Deduplicate JSON Schema Required Array

**Issue:** When using conditionals with overlapping fields, the `required` array has duplicates.

**Solution:** Simple fix before JSON output:
```typescript
required: [...new Set(required)]
```

**Files to modify:**
- `packages/build/src/json-schema/generator.ts`

**Effort:** Tiny (30 minutes)

---

### P3-2: Document Output Formats Clearly

**Issue:** Three output formats exist without clear guidance:
1. `buildFormSchemas()` - JSON Schema + JSON Forms UI Schema
2. `toFormSpec()` - Custom FormSpec format
3. CLI `generate` - JSON Schema + custom ux_spec.json

**Solution:** Add documentation explaining when to use each format:

| Format | Use Case | Output |
|--------|----------|--------|
| `buildFormSchemas()` | Runtime with JSON Forms | Standard JSON Schema + JSON Forms UI Schema |
| `toFormSpec()` | Custom rendering | FormSpec internal format |
| CLI `generate` | Build-time generation | Files on disk |

**Files to modify:**
- `packages/decorators/README.md`
- `packages/build/README.md`

**Effort:** Small (1-2 hours)

---

### P3-3: Add `--help` Support for CLI Subcommands

**Issue:** `formspec generate --help` returns "Unknown option: --help"

**Solution:** Add help flag handling for subcommands.

**Files to modify:**
- `packages/cli/src/index.ts`

**Effort:** Tiny (30 minutes)

---

### P3-4: Fix Required Property Inconsistency

**Issue:** For optional fields, generated types declare `required: false` but runtime value is `undefined`.

**Solution:** Ensure runtime values match declared types - explicitly set `required: false` instead of omitting.

**Files to modify:**
- `packages/decorators/src/index.ts` (toFormSpec function)

**Effort:** Small (1 hour)

---

### P3-5: Add Quick Start to @formspec/decorators README

**Issue:** CLI has Quick Start section, decorators README jumps straight into detailed examples.

**Solution:** Add 3-step quick start at top of README.

**Files to modify:**
- `packages/decorators/README.md`

**Effort:** Tiny (30 minutes)

---

## Priority 4: Low (Nice to Have)

### P4-1: Auto-generate Enum Options from Union Types

**Issue:** Union types like `"draft" | "active"` generate enum values in JSON Schema but not in ux_spec options array unless `@EnumOptions` is used.

**Solution:** Auto-populate `options` array from union type values (can use id as label).

**Effort:** Medium (2-3 hours)

---

### P4-2: Add Compile-Time Resolver Completeness Check

**Issue:** Missing resolvers are not caught at definition time, only at usage time or runtime.

**Solution:** Use TypeScript to ensure all dynamic enum sources have corresponding resolvers defined.

**Effort:** Large (significant type system work)

---

### P4-3: Add EnumOptions Shorthand

**Issue:** Current syntax is verbose:
```typescript
@EnumOptions([{ id: "admin", label: "Administrator" }])
```

**Solution:** Support shorthand:
```typescript
@EnumOptions({ admin: "Administrator", user: "User" })
```

**Effort:** Small (1-2 hours)

---

## Implementation Plan

### Phase 1: Critical Fixes (Target: 1 day)
- [ ] P1-1: Fix umbrella formspec package
- [ ] P1-2: Add ESM requirements to main README

### Phase 2: High Priority (Target: 2-3 days)
- [ ] P2-1: Fix validation API consistency
- [ ] P2-2: Fix @Group decorator inconsistency
- [ ] P2-3: Detect unexported classes in codegen
- [ ] P2-4: Add CLI TypeScript support (or fix docs)

### Phase 3: Polish (Target: 1 day)
- [ ] P3-1: Deduplicate JSON Schema required array
- [ ] P3-2: Document output formats clearly
- [ ] P3-3: Add --help for CLI subcommands
- [ ] P3-4: Fix required property inconsistency
- [ ] P3-5: Add Quick Start to decorators README

### Phase 4: Nice to Have (As time permits)
- [ ] P4-1: Auto-generate enum options
- [ ] P4-2: Compile-time resolver checks
- [ ] P4-3: EnumOptions shorthand

---

## Expected Scores After Fixes

| Scenario | Current | After P1-P2 | After P3 |
|----------|---------|-------------|----------|
| Chain DSL build-time | ~7-8/10 | 8.5/10 | 9.5/10 |
| Decorator CLI build-time | ~9/10 | 9/10 | 9.5/10 |
| Chain DSL runtime | 7/10 | 9/10 | 9.5/10 |
| Decorator runtime | 8/10 | 9/10 | 9.5/10 |
| Dynamic resolvers | 7.5/10 | 8.5/10 | 9/10 |

---

## Cross-Reference: Issues by Evaluation

| Issue | Eval 1 | Eval 2 | Eval 3 | Eval 4 | Eval 5 |
|-------|--------|--------|--------|--------|--------|
| Umbrella package broken | FP-1 | - | Critical | - | - |
| ESM not in main docs | FP-5 | - | High | - | - |
| Validation inconsistent | FP-3 | - | - | - | - |
| CLI no .ts support | FP-2 | - | - | - | - |
| @Group inconsistent | - | - | - | H1 | - |
| Unexported class not detected | - | - | - | H2 | - |
| Required array duplicates | FP-4 | - | - | - | - |
| No Quick Start in decorators | - | Minor | - | - | - |
| --help on subcommands | - | Minor | - | - | - |
| Multiple output formats | - | - | - | M1 | - |
| Required property undefined | - | - | - | M2 | - |
| No compile-time resolver check | - | - | - | - | Medium |
