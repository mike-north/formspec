---
"@formspec/analysis": patch
---

Phase 4 Slice D: document canary audit findings and ground the Phase 4 acceptance gate.

Updates `constraint-canaries.test.ts` with accurate Phase 4D audit commentary for all 13
remaining `.fails` canaries — identifying the two root causes (snapshot-path Role-B capability
check gap, IR-validation gap in snapshot consumer) and marking them as Phase 5 targets.

Updates `parity-harness.test.ts` KNOWN_DIVERGENCES to note that the alias-chain divergence
(#363) was reviewed and deferred in Phase 4D.

No behavior change: 0 canaries flipped. The 13 remaining `.fails` cases require Phase 5
(snapshot-path Role-B host-checker guard, or full synthetic-checker retirement) to resolve.
