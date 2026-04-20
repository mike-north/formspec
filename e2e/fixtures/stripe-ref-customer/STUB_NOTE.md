# Stub Note: resolvePayload / extractPayload not available

## Status

`resolvePayload` / `extractPayload` **does not exist** on `CustomTypeRegistration` in
`@formspec/core`. PR #300 was superseded by PR #308 and removed in PR #313.

## Impact on this fixture

The Phase 0.5l instructions originally contemplated using `resolvePayload` to register a
`Ref<T>` custom type that inspects the TypeScript `ts.Type` of the type argument at
build time. That path is no longer available.

## What PR #308 provides instead

PR #308 added the external-type bypass in `extractReferenceTypeArguments`
(`packages/build/src/analyzer/class-analyzer.ts`). When the type argument to `Ref<T>` is
a type declared in a *different* source file from the current analysis root, the analyzer
emits an opaque `{ kind: "reference", name: "<TypeName>", typeArguments: [] }` node
instead of recursing into the full declaration. This prevents the stack overflows observed
on deeply nested types like `Stripe.Customer`.

## What the fixture does

`customer-ref-form.ts` uses locally declared `Ref<T>` and `Customer`, `PaymentMethod`,
`Subscription`, and `Invoice` types from `stripe-like-types.ts` (a sibling file in this
fixture directory). The `stripe-like-types.ts` file is _not_ the analysis root, so the
external-type bypass fires for every `Ref<T>` field — exactly the path being benchmarked.

## Migration path (when/if resolvePayload lands)

If a future PR re-introduces `resolvePayload` or a functionally equivalent callback on
`CustomTypeRegistration`:

1. Remove `stripe-like-types.ts` (or keep it alongside a real `stripe` import).
2. Register `Ref<T>` via `defineCustomType<Ref<unknown>>({ ... resolvePayload: ... })`.
3. Update `stripe-ref-customer-bench.ts` to set `resolvePayloadAvailable: true`.
4. Re-run the benchmark and commit updated baseline numbers.
5. Delete or update this file.

## TODO

<!-- TODO: migrate to real `import Stripe from "stripe"` + resolvePayload once PR #300
     (or equivalent) re-lands. See STUB_NOTE.md for context. -->
