# FormSpec Developer Experience Evaluation Summary

**Date:** 2026-02-01
**Version Tested:** formspec@0.1.0-alpha.2, @formspec/decorators@0.1.0-alpha.3, @formspec/cli@0.1.0-alpha.3
**Methodology:** 5 independent evaluators with isolated workspaces, no cross-contamination of findings

---

## Executive Summary

| Evaluation | API Style | Use Case | Score | Verdict |
|------------|-----------|----------|-------|---------|
| #1 | Chain DSL | Build-time schema generation | 7.5/10 | Good API, poor discoverability |
| #2 | Decorator DSL | Build-time schema generation | 8.5/10 | Best experience overall |
| #3 | Chain DSL | Runtime field iteration | 5.0/10 | **BLOCKED by packaging bug** |
| #4 | Decorator DSL | Runtime with codegen | 7.5/10 | Works well, needs documentation |
| #5 | Chain DSL | Dynamic forms from API | 8.0/10 | Clean unified API |

**Overall Average: 7.4/10**

---

## Critical Issues (Must Fix)

### 1. TypeScript Type Resolution Completely Broken (CRITICAL)

**Severity:** Critical (Complete Blocker)
**Found by:** Evaluation #3
**Impact:** TypeScript users cannot use ANY package without manual patching

All published npm packages have incorrect `types` field in `package.json`:

| Package | Points To | Actual File |
|---------|-----------|-------------|
| `formspec` | `./dist/formspec.d.ts` | `./dist/index.d.ts` |
| `@formspec/dsl` | `./dist/dsl.d.ts` | `./dist/index.d.ts` |
| `@formspec/build` | `./dist/build.d.ts` | `./dist/index.d.ts` |
| `@formspec/core` | `./dist/core.d.ts` | `./dist/index.d.ts` |

**User Experience:**
```
error TS2307: Cannot find module 'formspec' or its corresponding type declarations.
```

**Workaround Required:** Users must create pnpm patches to fix each package's `package.json`.

**Root Cause:** API Extractor rollup files are not being generated, or build script points to wrong output filename.

---

## High Priority Issues

### 2. No README in npm Packages

**Severity:** High
**Found by:** Evaluations #1, #3, #5
**Impact:** No guidance on installation, usage, or getting started

The published npm packages contain no README.md. Users must:
- Read `.d.ts` files for JSDoc comments
- Guess at the API structure
- Have no way to find documentation or report issues

**Recommendation:** Add README.md to all packages with:
- Installation instructions
- Quick start example
- Link to full documentation
- ESM requirements note

### 3. Silent Type Degradation in Decorators

**Severity:** High
**Found by:** Evaluation #4
**Impact:** Users may ship incorrect forms without realizing

When `toFormSpec()` is called without type metadata (before importing codegen output):
- All fields become `_field: "text"` regardless of actual type
- All fields become `required: true` regardless of `?` modifier
- No warning or error is emitted

**Recommendation:** Add runtime warning:
```
Warning: ProfileForm has no type metadata. Run "formspec codegen" first.
```

---

## Medium Priority Issues

### 4. Module Resolution Requirements Not Documented

**Severity:** Medium
**Found by:** Evaluations #1, #5
**Impact:** Initial setup friction, confusing error messages

Package requires:
- `"type": "module"` in package.json
- `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in tsconfig.json

Error message doesn't indicate ESM issue:
```
error TS7016: Could not find a declaration file for module 'formspec'
```

**Recommendation:** Document ESM requirements clearly, or provide CJS build.

### 5. Conditional Field Type Inference

**Severity:** Medium
**Found by:** Evaluation #5
**Impact:** Type errors when creating partial data

Fields inside `when()` blocks are required in inferred type, even though they may not be visible:
```typescript
// Error: Property 'urgent' is missing
{ rating: "4", category: "feature" } satisfies FeedbackData
```

**Recommendation:** Make conditional fields optional in inferred type.

### 6. Class Export Requirement Not Documented

**Severity:** Medium
**Found by:** Evaluation #4
**Impact:** Codegen fails silently or with confusing errors

Classes must be exported (`export class MyForm`) for codegen to work, but this isn't documented.

### 7. Import Order Sensitivity

**Severity:** Medium
**Found by:** Evaluation #4
**Impact:** Subtle bugs if imports are reordered

Generated types file must be imported BEFORE using `toFormSpec()`:
```typescript
// WRONG - missing type info
import { toFormSpec } from '@formspec/decorators';
import './__formspec_types__.js';

// CORRECT
import './__formspec_types__.js';
import { toFormSpec } from '@formspec/decorators';
```

---

## Low Priority Issues

### 8. Missing Semantic Field Types

**Severity:** Low
**Found by:** Evaluations #1, #2
**Impact:** No built-in email, URL, phone validation

Would be nice to have:
- `field.email()` with format validation
- `field.url()`
- `field.textarea()` for multi-line text

### 9. No JSON Parser for Dynamic Forms

**Severity:** Low
**Found by:** Evaluation #5
**Impact:** Users must write custom JSON-to-FormSpec converters

Would be nice to have:
```typescript
const form = FormSpec.fromJSON(apiResponse);
```

### 10. Inconsistent Schema Output Between CLI and Runtime

**Severity:** Low
**Found by:** Evaluation #4
**Impact:** Different validators may behave differently

CLI and `buildFormSchemas()` produce slightly different JSON Schema for enums:
- CLI: `{ "enum": ["a", "b"] }`
- Runtime: `{ "oneOf": [{ "const": "a" }, { "const": "b" }] }`

---

## What Worked Exceptionally Well

### Excellent API Design (All Evaluators)

The functional DSL was praised by all evaluators:
```typescript
const Form = formspec(
  field.text("name", { label: "Name", required: true }),
  field.enum("status", ["active", "inactive"]),
  field.boolean("enabled"),
);
```

- Clean, intuitive syntax
- Matches developer expectations
- Minimal boilerplate

### Outstanding Type Inference (Evaluations #1, #2, #3, #5)

```typescript
type Schema = InferSchema<typeof Form.elements>;
// Correctly infers: { name: string; status: "active" | "inactive" | undefined; ... }
```

- Literal types inferred for enums without `as const`
- No redundant type annotations needed
- Works at both build-time and runtime

### Zero-Runtime Overhead Decorators (Evaluations #2, #4)

The decorator approach was praised for:
- No reflection metadata required
- Tree-shaking friendly
- Type inference from TypeScript syntax (no `@Required()` needed)

### Perfect Runtime Field Access (Evaluation #3)

```typescript
for (const element of Form.elements) {
  console.log(element.name, element._field, element.label);
}
```

- Complete field metadata available at runtime
- Discriminated unions with `_type` and `_field` for type narrowing
- Exactly what's needed for dynamic form rendering

### Unified API for Static and Dynamic Forms (Evaluation #5)

```typescript
const { jsonSchema, uiSchema } = buildFormSchemas(staticForm);
const { jsonSchema, uiSchema } = buildFormSchemas(dynamicForm);
// Both produce identical output structure
```

- Same rendering logic works for both
- Clean separation of concerns

### Comprehensive JSDoc Documentation (All Evaluators)

The inline JSDoc in `.d.ts` files partially compensated for missing README:
- Clear function signatures
- Good examples
- Helpful parameter descriptions

---

## Recommendations by Priority

### P0: Critical (Before Next Release)

1. **Fix types field in all package.json files**
   - Ensure `types` points to actual `.d.ts` file (`./dist/index.d.ts`)
   - Verify API Extractor is generating rollup files correctly

2. **Add README.md to npm packages**
   - Installation instructions
   - Quick start example
   - ESM requirements
   - Link to documentation

### P1: High Priority

3. **Add runtime warning for missing type metadata**
   - Warn when `toFormSpec()` called without `__formspec_types__`
   - Point users to codegen command

4. **Document ESM requirements prominently**
   - Required tsconfig settings
   - Required package.json settings

### P2: Medium Priority

5. **Document class export requirement for codegen**

6. **Document import order requirement for codegen output**

7. **Fix conditional field type inference**
   - Make fields in `when()` blocks optional

8. **Unify JSON Schema output format**
   - CLI and runtime should produce identical schemas

### P3: Nice to Have

9. **Add semantic field types** (`field.email()`, `field.url()`)

10. **Add `FormSpec.fromJSON()` helper for dynamic forms**

11. **Add `formspec init` CLI command**

12. **Create documentation website**

---

## Scoring Breakdown by Category

| Category | Eval #1 | Eval #2 | Eval #3 | Eval #4 | Eval #5 | Avg |
|----------|---------|---------|---------|---------|---------|-----|
| API Design | 9 | 9 | 9 | 7 | 9 | **8.6** |
| Type Safety | 10 | 8 | 9 | 8 | 8 | **8.6** |
| Documentation | 6 | 9 | 4 | 8 | 6 | **6.6** |
| Installation | - | 10 | 3 | - | 7 | **6.7** |
| Error Messages | 6 | - | 6 | 5 | 8 | **6.3** |
| Generated Output | 8 | - | 10 | - | - | **9.0** |

**Strongest Area:** API Design & Type Safety
**Weakest Area:** Documentation & Installation (due to packaging bug)

---

## Conclusion

FormSpec has **excellent core API design** that developers find intuitive and powerful. The type inference system is particularly impressive, and the dual-output (JSON Schema + UI Schema) approach is valuable.

However, a **critical packaging bug** makes the library unusable for TypeScript users without manual intervention. This single issue dropped one evaluation from what would likely be 8+ to 5/10.

**Priority fix:** Correct the `types` field in all `package.json` files before the next npm release. This alone would likely raise the average score by 1-2 points.

The Decorator DSL with build-time CLI (Evaluation #2: 8.5/10) currently provides the best developer experience, while the Chain DSL runtime approach (Evaluation #3: 5/10) is blocked by the packaging bug.

---

## Appendix: Friction Log Locations

- Evaluation #1: `/tmp/formspec-dx-eval-1/friction-log.md`
- Evaluation #2: `/tmp/formspec-dx-eval-2/friction-log.md`
- Evaluation #3: `/tmp/formspec-dx-eval-3/friction-log.md`
- Evaluation #4: `/tmp/formspec-dx-eval-4/friction-log.md`
- Evaluation #5: `/tmp/formspec-dx-eval-5/friction-log.md`
