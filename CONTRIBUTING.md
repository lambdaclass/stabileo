# Contributing

## What runs on a PR vs in the merge queue

Every PR runs repository lint, toolchain-pin checks, changelog validation, and
engine test-target registration checks. Additional work depends on changed paths:

| PR changes | Additional checks |
| --- | --- |
| Only `docs/**`, root `*.md`, `changelog.d/**` | None |
| `research/**`, `web/src/components/research/**`, `web/e2e/research*.spec.ts` | Research validation/catalog/isolation, Research WASM, research web unit tests, research smoke specs, route budgets |
| `web/src/components/tools/**`, `web/e2e/tools*.spec.ts` | Tools unit tests, tools smoke specs, route budgets |
| `engine/**` | Engine lint/gates/suites/metamorphic, determinism, results snapshots, full web unit tests, engine-facing smoke specs tagged `@engine` |
| Anything else, multiple code areas, or uncertain selection | Full pipeline |

Documentation/changelog changes may accompany one code area without broadening
its selection. Markdown inside a code directory follows that directory's rule.
Shared libraries, app code, dependencies, tooling, CI and unrecognized E2E specs
always select full CI. The `run-e2e` label also forces full CI, including slow E2E.
Area selectors require unit tests and matching specs; missing coverage falls back
to full CI. In particular, the tools directory and its `tools*.spec.ts` convention
are reserved here and do not exist on this branch yet.

Focused E2E runs use one shard and still build the real shared engine WASM,
Research WASM and E2E site. Research/tools PRs skip the separate Web Build,
engine suites, determinism, results snapshots and unrelated E2E tests. Research
feedback is expected in roughly 15–30 minutes with warm caches, rather than
45–90 minutes; this is an estimate, not a measured guarantee. WASM compilation,
site construction, route-budget baseline builds and runner availability still
set the lower bound.

The merge queue (`merge_group`) and every push to `main` run all jobs regardless
of paths, including all ten E2E shards, slow E2E, Web Build and all unit/engine
suites. Existing non-blocking visual/quarantine policy is unchanged. Only PR
feedback is narrowed; the queue tests the combined candidate before it lands.
`CI OK` rejects any failure or cancellation and accepts intentional job skips.
The compatibility checks `rust` and `npm` mirror `CI OK` and always resolve.
PR research checks run through CI once; main and weekly standalone runs retain
the online catalog audit.

The selection lives in `.github/scripts/select-ci.py`. Extend its conservative
path/spec mapping and `scripts/tests/test_ci_selection.py` together. Validate
with `make test.ci-scripts NIX_RUN=` (Python and shellcheck required) and
`nix shell nixpkgs#actionlint -c actionlint` when editing workflows.
