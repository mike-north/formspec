---
"@formspec/build": patch
"formspec": patch
---

Surface Promise-unwrap failures and map `void` to null in schema generation.

- `unwrapPromiseType` now throws a descriptive error when `checker.getAwaitedType` fails to unwrap a `Promise<T>`-shaped return type. Previously the payload would silently degrade to `{ type: "string" }`; this commonly occurred when the TypeScript compiler host could not locate its default lib files (e.g. after bundling `typescript` with esbuild), as described in #256.
- `void` types (e.g. `void`, `Promise<void>` return types) now map to `{ type: "null" }`, matching the treatment of `undefined`. Previously `void` fell through to the string fallback and was indistinguishable from an actual `string` return type (#257).
