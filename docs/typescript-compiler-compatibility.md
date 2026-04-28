# TypeScript Compiler Compatibility

This supplemental guide is for changes that touch FormSpec's TypeScript compiler API usage or the TypeScript-version CI matrix. Do not load it for ordinary feature work that does not import `typescript`, change TypeScript package dependencies, or debug TypeScript-version CI.

## Current Support Model

FormSpec's official TypeScript peer range is `>=5.7.3 <7` for packages that expose or consume the compiler API. TypeScript 7 is not an official supported major yet. The dedicated `typescript-7-tsgo` CI job is a non-blocking native-preview probe for issue [#449](https://github.com/mike-north/formspec/issues/449).

The TS 7 job deliberately uses two TypeScript surfaces:

- `@typescript/native-preview@beta` supplies the `tsgo` binary.
- `@typescript/typescript6` supplies the JavaScript compiler API currently used by FormSpec packages and tooling.

Keep this distinction intact. `pnpm run build`, `pnpm run test`, `tsup`, lint, and API Extractor still run through the TS 6 JavaScript API in that job. The direct native-preview check is only `pnpm exec tsgo --noEmit --skipLibCheck`, wrapped by `scripts/tsgo-ci.mts`.

## Key Files

- `.github/workflows/ci.yml`: owns the per-PR TypeScript matrix and the non-blocking `typescript-7-tsgo` job.
- `.github/workflows/typescript-minor-smoke.yml`: owns weekly minor-version smoke coverage for supported TS 5/6 minors.
- `scripts/tsgo-ci.mts`: owns TS 7 job setup details that would otherwise become embedded workflow JavaScript.
- `scripts/tsgo-ci.test.mts`: tests the TS 7 setup helpers and should grow with the helper.
- `knip.json`: ignores the CI-only `tsgo` binary.
- `CLAUDE.md` and `AGENTS.md`: point agents here only for TypeScript-compatibility work.

## When Adding A Package That Uses TypeScript

If a new workspace imports from `typescript` or shells out to `tsc`, decide whether it needs a direct `typescript` dependency:

- Public package/runtime compiler API use generally belongs in `peerDependencies` with the supported range, currently `>=5.7.3 <7`.
- Private test, benchmark, or fixture workspaces can use `devDependencies`.
- Do not add a direct dependency just to inherit another package's compiler host. Prefer an existing FormSpec package API when one exists.

The TS 7 alias guard in `scripts/tsgo-ci.mts` discovers workspaces under `packages/*`, `examples/*`, and `e2e` that declare a direct `typescript` dependency. If a new workspace lives somewhere else, update `discoverTypeScriptApiWorkspaceRoots()` and its tests. Do not replace the guard with a static list unless the workspace layout itself becomes static and tested.

After adding or moving a TypeScript-using workspace, run:

```bash
pnpm run test:scripts
pnpm run knip
```

Then run the TS 7 row in a temporary copy if the change can affect compiler resolution or workflow behavior.

## When Adding Compiler API Usage

Prefer a small helper in the existing owning package over scattering raw compiler checks across the repo. The longer-term target is tracked in issue [#476](https://github.com/mike-north/formspec/issues/476): a unified internal compiler API facade that insulates most of FormSpec from TS 5/6/7 nuance.

Until that facade exists:

- Import the runtime namespace with `import * as ts from "typescript"` when reading enum values or runtime compiler helpers.
- Use named enum members such as `ts.TypeFlags.Null`; never hardcode numeric flag values.
- Keep compiler objects out of Canonical IR and serialized protocols.
- Treat new public APIs exposing `ts.*` types as API design work. Update API reports and document the public evolution strategy.
- Add tests for intended FormSpec behavior, not snapshots of whatever the current compiler happens to return.

If a change reaches for a new part of the compiler API, ask whether the behavior should be normalized behind a helper now. If the answer is "not in this PR," mention issue #476 in the PR or follow-up issue.

## Debugging The TS 7 Job

Map failures to the step that owns them:

- `Pin TypeScript via the typescript6 alias and native-preview`: package mutation failed, or the `@typescript/native-preview` beta tag changed unexpectedly.
- `Install dependencies`: pnpm override interaction failed. Inspect `package.json`, `pnpm-lock.yaml`, and `pnpm why typescript`.
- `Expose TypeScript 6 compatibility bins and server subpaths`: the `@typescript/typescript6` package layout changed, `tsc6` is missing, or tsserver subpaths moved.
- `Assert TypeScript API alias resolution`: a workspace with a direct `typescript` dependency did not resolve to `@typescript/typescript6`. This often means a new package was added outside the discovery rules, or an override no longer applies to that package.
- `Build` or `Run tests`: the TS 6 JavaScript API alias is not behaving like the supported compiler API. This is not a `tsgo` native check failure.
- `Typecheck with tsgo`: the native-preview compiler rejected the scoped package source/test surface. The current `skipLibCheck` workaround is tracked in [#469](https://github.com/mike-north/formspec/issues/469); e2e tsgo coverage is tracked in [#471](https://github.com/mike-north/formspec/issues/471).

When reproducing locally, use a temporary copy so `npm pkg set` and `pnpm install --no-frozen-lockfile` do not dirty the PR worktree. Run the workflow commands in the same order as CI, including `pnpm exec tsx scripts/tsgo-ci.mts prepare-compat`, `assert-alias`, and `typecheck`.

## What Not To Do

- Do not make TS 7 blocking until the project explicitly promotes it to official support.
- Do not test TS 7 through `typescript` dist-tag drift. Use `@typescript/native-preview@beta` for the native-preview row.
- Do not add lint, `tsup`, or API Extractor to the direct `tsgo` path unless the project has adopted a stable TS 7 programmatic API.
- Do not remove the `assert-alias` step to get a green build. Fix workspace discovery, package dependencies, or pnpm overrides instead.
- Do not broaden public peer ranges for TS 7 until the public compiler API exposure and facade plan are resolved.
