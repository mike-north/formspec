/**
 * `@jsonforms/core` (a test-only devDependency) ships store type declarations
 * that reference `Symbol.observable`. That global augmentation lives in the
 * `symbol-observable` package, which `@jsonforms/core` relies on ambiently but
 * does not re-declare in its own `.d.ts` files. Without it, type-checking the
 * build package's tests fails on `@jsonforms/core`'s bundled declarations.
 *
 * This global shim supplies the optional member so the dependency type-checks.
 * It is intentionally scoped to the build package's test compilation only.
 */
interface SymbolConstructor {
  readonly observable: symbol;
}
