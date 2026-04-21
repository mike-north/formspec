---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Phase 4 Slice D — canary audit + acceptance-gate grounding.

Updates `constraint-canaries.test.ts` with accurate Phase 4D audit commentary for all 13
remaining `.fails` canaries — identifying the two root causes (snapshot-path Role-B capability
check gap, IR-validation gap in snapshot consumer) and marking them as Phase 5 targets.
One canary (`@pattern on string[]`) is relabeled as intentional: `supportsConstraintCapability`
in the build path treats `string[]` as string-like for `@pattern`, so neither consumer emits
`TYPE_MISMATCH`. The test is retained as a regression guard only.

Updates `parity-harness.test.ts` KNOWN_DIVERGENCES to note that the alias-chain divergence
(#363) was reviewed and deferred in Phase 4D.

No behavior change: 0 canaries flipped. The 13 remaining `.fails` cases require Phase 5
(snapshot-path Role-B host-checker guard, or full synthetic-checker retirement) to resolve.

Per the repo's changeset policy, any change under `packages/<name>/src` triggers a patch bump
for that package and all transitively-dependent packages, even when the change is
test-comment-only and produces no behavioral difference.
