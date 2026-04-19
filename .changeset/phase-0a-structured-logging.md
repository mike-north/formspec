---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add structured constraint-validator debug logging (Phase 0-A)

Implements §8.3a–8.3d and §8.3f from the synthetic-checker retirement plan:

- Introduces the `formspec:analysis:constraint-validator` namespace family with
  sub-namespaces `:build`, `:snapshot`, `:typed-parser`, `:synthetic`, and
  `:broadening` in a new `constraint-validator-logger.ts` module in
  `@formspec/analysis`.
- Emits one structured log entry per constraint-tag application (§8.3b) from
  both the build consumer (`tsdoc-parser.ts`) and the snapshot consumer
  (`file-snapshots.ts`). Each entry includes `consumer`, `tag`, `placement`,
  `subjectTypeKind`, `roleOutcome` (A-pass/A-reject/B-pass/B-reject/C-pass/
  C-reject/D1/D2/bypass), and `elapsedMicros`.
- Logs extension-registry construction events and synthetic batch setup
  diagnostics at `debug` level (§8.3c).
- Logs `resolvePayload` invocations with `extensionId`, `customTypeName`, and
  `tsApisTouched` flag at the custom-type resolution site in `class-analyzer.ts`
  (§8.3d; `tsApisTouched: false` until PR #300 lands).
- Adds a "Debugging constraint validation" section to `ARCHITECTURE.md` (§8.3f)
  documenting `DEBUG=formspec:analysis:constraint-validator:*` usage and the
  structured log-entry schema.

Enable with `DEBUG=formspec:analysis:constraint-validator:*`. No behavior changes.
