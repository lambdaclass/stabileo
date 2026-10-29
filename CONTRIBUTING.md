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

## Infrastructure failures and shared builds

Self-hosted jobs skip the Nix installer and Magic Nix Cache and use the host's
warm store. Hosted jobs disable FlakeHub and tolerate installer/cache-action
failures; preparing the Nix shell must still succeed. Actions caches are optional.
`.github/scripts/retry-infra.sh` makes at most three attempts, with 10/20-second
backoff, for FlakeHub unauthenticated initialization, Magic Nix Cache throttling,
HTTP 418/429, connection resets, and `ERR_SOCKET_CLOSED_BEFORE_CONNECTION`.
Only dependency acquisition is wrapped: Nix shell preparation, npm ci, cargo
fetch, Playwright installation and same-run artifact downloads. Compilation,
tests, assertions, missing artifacts, permission errors and job timeouts fail
normally. Do not wrap an install plus a test/build in the same retry command.
The matcher and retry exit-status behavior are tested by `make test.ci-scripts`.

Full-PR build counts, traced through `ci.yml`, `research.yml` and Dockerfile:

| Output | Before | After (cold / research cache hit) |
| --- | ---: | ---: |
| Engine WASM | 2 | 1 / 1 |
| Research WASM set (both crates) | 2 | 1 / 0 |
| Site builds | 6 | 5 / 5 |

Docker smoke now downloads `site-production` from Web Build, including both
WASM bundles, and tests backend compilation and runtime packaging. Local Docker
builds still compile everything from source by default; CI no longer exercises
the Docker frontend compiler stages. The remaining five site builds are distinct:
production, E2E with test hooks, admin, and the deterministic engine-stub route
budget builds for main and candidate. Reusing one for another would change what
those gates measure. All E2E consumers share `site-e2e`; other WASM consumers
share `wasm` and `research-wasm` from the current run. Artifact reads use the
read-only Actions token and the pinned flake's gh CLI (hosted Docker uses gh).
Docs PRs build none; focused research/tools PRs build one engine, zero or one
research set, and three sites (E2E and the two route-budget builds); engine PRs
build one E2E site and the same shared WASM outputs.

Research's exact source cache includes engine/research Rust sources, manifests,
lockfiles, toolchain and build scripts, and reference data. There is no fallback
key. Viewer assets are rebuilt and their identity republished even on a hit;
Node reference checks still run. A cache outage falls back to compilation.
The 30-minute research timeout stays: hosted run 40969889257 completed in
22m26s, including 17m17s building research WASM/viewer. An unchanged-source hit
should save roughly 15–17 runner minutes. Docker smoke previously took 21m38s
in that run; avoiding its frontend stages should save additional runner time,
but that portion has not been measured separately. Docker now waits for Web
Build, so total PR wall time may increase on a cold cache; do not equate runner
minutes saved with critical-path improvement. Measure the first hosted runs
before revising the timeout or promising an overall speedup.
