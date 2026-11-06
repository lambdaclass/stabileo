# Contributing

## What runs on a PR vs in the merge queue

Every PR runs repository lint, toolchain-pin checks, changelog validation, and
engine test-target registration checks. Additional work depends on changed paths:

| PR changes | Additional checks |
| --- | --- |
| Only `docs/**`, root `*.md`, `changelog.d/**` | None |
| `research/**`, `web/src/components/research/**`, `web/e2e/research*.spec.ts` | Research validation/catalog/isolation, Research WASM, research web unit tests, research smoke specs, route budgets |
| `web/src/components/tools/**`, `web/e2e/tools*.spec.ts` | Tools unit tests, tools smoke specs, route budgets |
| `engine/**` | Engine lint/gates/suites/metamorphic, determinism, results snapshots, full web unit tests, the research workflow (isolation, production engine benchmarks, research crates on the engine), engine-facing smoke specs tagged `@engine` |
| Anything else, multiple code areas, or uncertain selection | Full pipeline |

Documentation/changelog changes may accompany one code area without broadening
its selection. Markdown inside a code directory follows that directory's rule.
Shared libraries, app code, dependencies, tooling, CI and unrecognized E2E specs
always select full CI. The `run-e2e` label also forces full CI, including slow E2E; adding it does not
start a run, so push or re-run CI afterwards.
Area selectors require unit tests and matching specs; missing coverage falls back
to full CI. In particular, the tools directory and its `tools*.spec.ts` convention
are reserved here and do not exist on this branch yet.

Focused E2E runs use one shard and still build the real shared engine WASM,
Research WASM and E2E site. Research/tools PRs run the separate Web Build,
including TypeScript and Svelte checks, and skip engine suites, determinism,
results snapshots and unrelated E2E tests. Research
feedback is expected in roughly 15–30 minutes with warm caches, rather than
45–90 minutes; this is an estimate, not a measured guarantee. WASM compilation,
site construction, route-budget baseline builds and runner availability still
set the lower bound.

The merge queue (`merge_group`) runs what combining PRs can break, regardless of
paths: Web Build with the TypeScript/Svelte checks, engine lint/gates/metamorphic/suites,
web unit tests, results snapshots, Research WASM and route budgets, backend and
CI-script checks, all ten E2E smoke shards and the Supply chain audits. It skips the
heavy jobs that combining PRs rarely breaks: slow E2E, visual baselines, Docker build
smoke, Determinism, quarantined E2E and research validation. Every push to `main` and
the nightly CI run (03:30 UTC) run everything. When a push to `main` fails twice (its
failed jobs are rerun once), `post-merge.yml` opens a signed revert PR of every merge
since the last green push and notifies ntfy; once a person approves it and its
required checks pass, it is enqueued at the front of the queue. It needs the
`REVERT_BOT_TOKEN` secret (a token whose PRs trigger CI: contents and pull requests
write, actions write) and `NTFY_TOPIC` (optionally `NTFY_SERVER`, `NTFY_TOKEN`).
`CI OK` rejects any failure or cancellation and accepts intentional job skips.
The required `rust` and `npm` checks are the Supply chain workflow's audits, which run on every
pull request, merge group and push to main; nothing else may use those job names.
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

Top-level full-PR build counts, excluding builds spawned by tests (including
`e2e-hook-gating`, `no-dev-assets-in-build`, and `published-urls-resolve`):

| Output | Cold / research cache hit |
| --- | ---: |
| Engine WASM | 5 / 5 |
| Research WASM set (both crates) | 2 / 1 |
| Site builds | 6 / 6 |

Docker smoke tests both the default source build used by Compose and the
`site-production` artifact from Web Build. The four site builds are production,
E2E with test hooks, admin, and Docker source. The route-size job additionally
builds main and the candidate with a deterministic engine stub and reports each
route's growth on the PR; size never fails a PR. A change touching research code
shipped to the browser may grow a route by 128 bytes at most (research isolation),
and research modules in a product chunk always fail. The weekly Route size workflow
checks main against the ceilings in `web/scripts/route-size-ceilings.json` and opens
a `route-size` issue when a route is over.
All E2E consumers share `site-e2e`; other WASM consumers share `wasm` and
`research-wasm` from the current run. Artifact reads use the read-only Actions
token and the pinned flake's gh CLI (hosted Docker uses gh).
Docs PRs build none. Every other scope runs Docker smoke (all these scopes touch
Docker builder inputs) and Web Build, including the explicit
TypeScript baseline and Svelte gates. Engine PRs also run AI-backend and native
research validation because those crates depend directly on the engine.

Research's exact source cache includes engine/research Rust sources, manifests,
lockfiles, toolchain and build scripts, and reference data. There is no fallback
key. Viewer assets are rebuilt and their identity republished even on a hit;
Node reference checks still run. A cache outage falls back to compilation.
The research WASM job has a 60-minute timeout (about 15 crates); before the cache, hosted run 40969889257 completed in
22m26s, including 17m17s building research WASM/viewer. An unchanged-source hit
should save roughly 15–17 runner minutes. Docker smoke previously took 21m38s
in that run. It retains the default source build and also tests the prebuilt-site
path, so artifact reuse does not eliminate its source compilation. Docker now waits for Web
Build, so total PR wall time may increase on a cold cache; do not equate runner
minutes saved with critical-path improvement. Measure the first hosted runs
before revising the timeout or promising an overall speedup.
