---
"@formspec/cli": patch
---

Fix `formspec generate` reporting success (exit 0) when it should have failed:

- `--emit-ir` now exits non-zero when IR validation produces error-severity diagnostics, even without `--validate-only`. Previously the exit code was only consulted inside the `--validate-only` branch.
- A chain-DSL export whose schema generation throws is still reported to stderr with its export name and cause (as before), but the run now exits non-zero instead of silently succeeding. Exports that generated successfully are still written — there is no `--allow-partial` opt-in in this release; any failed export fails the run.
- "No FormSpec exports found" and "FormSpec exports were found but all failed schema generation" are now distinguishable failure messages instead of being reported identically.
- `--validate-only` semantics for constraint-violation reporting are unchanged; a throwing export now also fails a `--validate-only` run, since that export's constraints were never actually validated.
