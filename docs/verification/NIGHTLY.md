# Nightly verification

`nightly.yml` starts at 00:00 UTC and accepts `workflow_dispatch`. A dispatch takes the nightly pool only between 00:00 and 07:00 UTC and runs on `ubuntu-24.04` the rest of the day, so pull requests and the merge queue keep the hosts' CPU. Set the
repository Actions variable `STABILEO_SELF_HOSTED=true` to route compute jobs on
`main` to the nightly pool, `[self-hosted, stabileo-nightly]`. Otherwise they use `ubuntu-24.04`.
No scheduled job may reach the merge queue's runners (`stabileo`, `stabileo-pr`, `stabileo-e2e`,
`stabileo-timing`); `scripts/tests/test_ci_runners.py` evaluates every scheduled job's `runs-on`
to enforce it. `fuzz` goes to the nightly pool only when `STABILEO_NIGHTLY_POOL=true` too, and
otherwise to `ubuntu-24.04`. Dispatches
on other branches always use hosted runners and dry-run reporting. There is no
pull-request trigger. The plan and findings jobs always run on GitHub-hosted
runners. Only `findings` has `issues: write`; compute jobs have `contents: read`.

**Alerting** (`.github/workflows/verification-alert.yml`, `.github/scripts/verification-alert.cjs`).
A failed, timed-out or cancelled scheduled run of `nightly.yml`, `differential.yml`, `verify.yml`,
`mutation-ts.yml`, `verification-dashboard.yml` or `supply-chain.yml` opens **one issue per
workflow**, titled `CI failure: <workflow>` and labelled `ci-failure`, with the run link and the
failing jobs, or comments on the one already open. Once it is triaged after its latest failure (a
maintainer commented on it, linking the finding issues or writing "no finding" and why, or added the
`triaged` label and left it on; any other comment does not count), the next green scheduled run closes it, provided that run is the workflow's
latest scheduled run, so each new red spell opens a fresh issue (which is what notifies the repository's
watchers; a comment on a months-old issue notifies nobody). An untriaged issue stays open through
green runs, with one comment saying so: a rotated seed or shard going green does not mean the
failure was not a finding. Once a day (13:00 UTC) a staleness check does
the same for a workflow that has not completed a scheduled run in its window (32 h; 8 days for
the weekly dashboard), or that is disabled or renamed.

The `ci-failure` issue only says that the workflow is red. Each real finding behind it has its
own issue: `nightly.yml`'s model findings open `nightly-finding` issues automatically (below);
the rest (a differential mismatch in `differential.yml`, a missed mutant, a failing proof) are
triaged by hand, labelled `bug` and also `safety` when a result could be wrong, with their
reproduction, and linked from the `ci-failure` issue. Finding issues are never closed
automatically: the random seeds and the mutants shards change every night, so a green run the
next day does not mean the finding is fixed.

Negative case: `gh workflow run nightly.yml -f force_failure=true` (or `differential.yml`) fails
at once, without running anything, and must open `CI failure: <workflow> [forced failure]`, an
issue of its own that the real alerts never touch; close it by hand.

The six Arch runners need the existing Rust/nix/clang/mold environment, Python 3
and GNU timeout. Their service-provided `CARGO_TARGET_DIR` is preserved; hosted
fallback installs tools and uses the workspace target directory. Rust caches and
hosted-only setup actions do not run on the dedicated machine. OpenSees and
Code_Aster jobs install their reference environments independently. The random
job uses OpenSees only if importable in its Python and Code_Aster only if
`ASTER_PYTHON` is configured and imports `code_aster`; installed checks and skipped
references are printed and stored in its summary. A broken configured reference
is a harness error, not a successful comparison.

## Budgets

| Job | Work per night | Hard job limit |
| --- | --- | --- |
| `certify-large` | Large certificates and assembly sweep | 60 min |
| `metamorphic-nightly` | Full corpus plus 1,000 random cases **per dimension** on own runners; 200 per dimension hosted; exhaustive invariants/analyses; test command capped at 110 min | 150 min |
| `random-models` | 1,000 valid generated models, alternating 2D/3D attempts; 100 hosted; two-hour work budget, 30 min hosted | 150 min |
| `properties` | 10,000 cases per property, 1,000 hosted; command budget 2 h / 30 min | 150 min |
| `opensees-diff` | Fixtures plus 4,160 random analysis cases | 45 min |
| `codeaster-diff` | Fixtures plus 900 random 3D models | 60 min |
| `fuzz` | Four independent targets, each 2 h own / 30 min hosted, 2 GiB RSS and 60 s per input | 180 min each |
| `mutants` | Four of 512 shards, each capped at 120 min | 150 min each |
| `bench` | Criterion, informational; measurements capped at 25 min | 45 min |
| `plan` / `findings` | Routing/rotation and issue publication | 5 / 10 min |

There are more jobs than runners: GitHub queues them across the six registered
runners. Two Cargo workers per job bound compilation pressure. At full command
budgets this is roughly 25 runner-hours (about four to five hours on six idle
runners, plus setup/queue overhead), not a guaranteed completion time. Nightly
runs are serialized with `cancel-in-progress: false`. Counts are coverage targets;
exhausting a budget before completing them fails visibly. All jobs have wall-clock
limits; report reduction has its own 15-minute step cap. Artifacts upload with
`always()`; abrupt runner loss or hard cancellation can still prevent an upload.

The test files are modules of a few shared binaries (`engine/tests/<binary>/main.rs`), so
`--test <binary>` alone would run every module in it for each mutant: from 2026-10-24 to -28
that doubled the baseline (155 s to ~400 s, a missed mutant ~800 s) and no shard finished.
`scripts/mutants.sh` passes nextest a filterset (`-E`) that keeps the run to the listed files.
A shard fails whenever `mutants.out/missed.txt` is not empty, whatever cargo-mutants' exit code
(it reports timeouts, 3, over missed mutants, 2).

Mutation shards rotate by UTC day, 32 each night, on the nightly runner pool
(`stabileo-nightly`, or the `stabileo` pool when it is off): a complete 512-shard
pass takes 16 nights, the roadmap's promise. A shard that runs to its verdict
uploads `mutants-done-<k>-of-<n>`; the weekly verification dashboard fails when
any shard has none from the last 16 days
(`scripts/verification-metrics.py --check-mutants-rotation`). Override
`mutants_total` and `mutants_shards` for focused runs.

## Random models and findings

`scripts/nightly-models.py` uses the existing `solve_json --gen2d/--gen3d`
generators. The default base seed is UTC `YYYYMMDD`; candidate seeds are
`base * 100000 + candidate_index`. It prints and stores the base seed, counts
valid/rejected models and requires the requested number of solvable models
(with at most ten attempts per requested model). These same models run through
the existing metamorphic checks, including symmetry, and installed differential
adapters (Code_Aster supports 3D only). Every model/reference invocation has a
180-second timeout. Harness errors, reference execution errors (including
`opensees_failed`), and generator failures fail the job. Per-check comparison
counts distinguish completed comparisons from skipped and inconclusive outcomes;
valid generated inputs alone do not establish reference comparison coverage.
Metamorphic replay exports per-analysis/invariant verdict counts. Only passing
and failing invariants count as completed; every replayed model must have at
least one such verdict, or the job fails for insufficient coverage. Refusals and
conditioning failures remain inconclusive; unrepresentable and inapplicable
checks remain skipped.

Failed exhaustive metamorphic models and differential dumps are also replayed
and reduced. Collection first packages every original dump as a reportable
`dumped_failure`, then replays all models without reduction before reducing them.
A classified replay finding replaces its original placeholder; unsuccessful or
interrupted replays retain the original model and reproduction command. Replay
and reduction share a 14-minute budget within the 15-minute collection step.
Metamorphic exports retain the case name and densities because
those affect transformations and dynamic checks. A finding is keyed by **check + failure kind + normalized root-cause message**,
independent of model and seed. Differential numerical signatures include the
analysis, failing quantity and component from `worst`, excluding instance IDs,
time-step indices and numeric results. Other normalized causes aggregate across
analyses and relations. Normalization strips case
wrappers, IDs and numbers while preserving semantic distinctions such as tangent
versus effective stiffness. Transformed-model failures after an accepted original
are input-consistency findings labeled `invariance-refusal`; numeric mismatches
are labeled `wrong-result-candidate`. Each issue also has `safety` and
`nightly-finding` labels, per-run finding/analysis/relation/model counts, and one
smallest available reduced reproducer with its seed, commit/run link, reduction
status and replay command. Original model hashes retain model counts across
reduction (older artifacts fall back to the reduced model hash).
Oversized JSON remains
complete in the linked artifact. Repeated findings update the same issue;
closed findings are reopened when they recur. Rerunning the reporter does not
repeat the same run-attempt comment. Green nights never close issues.

The reducer repeatedly deletes loads or members while preserving solvability
and the **same** failing test and stable failure signature. Candidates must still
produce a failure from the adapter or invariant check; error magnitudes,
conditioning estimates and numeric message details may change. Completed reductions are 1-minimal under those
deletions, not mathematically smallest models. It has a 300-second per-finding
budget in the random job (120 seconds for existing dumps); budget-limited
results are explicitly marked. Fuzzer crashes use bounded libFuzzer reduction.
Non-JSON crashes use a JSON `raw_hex` envelope and a byte-exact replay command. Findings and property logs are retained
for 90 days. Property failures also produce per-test findings, retaining the last failing
proptest shrink candidate (base model and all actual solver inputs) and a seeded
exact-test command. A timeout during shrinking is explicitly not claimed to be
a completed minimum. Infrastructure failures, timeouts and mutation survivors are reported by
`verification-alert.yml` (one `ci-failure` issue per workflow, above) and the logs;
they are not misrepresented as minimized model findings. The alert workflow has
its own isolated issue permission.

## Dispatch and reproduce

After this workflow is on `main`, start a small end-to-end run (issue writes are
disabled by default for manual dispatch):

```sh
gh workflow run nightly.yml --ref main -f only=random-models -f random_count=5 -f seed=20261029
# Check artifacts and the findings job's dry-run output; publish actual findings:
gh workflow run nightly.yml --ref main -f only=random-models -f random_count=5 -f seed=20261029 -f findings_dry_run=false
# Full night, including all compute jobs:
gh workflow run nightly.yml --ref main -f findings_dry_run=false
# Focused mutation sample:
gh workflow run nightly.yml --ref main -f only=mutants -f mutants_total=1024 -f mutants_shards='[0]'
# Alerting: what it would report for a run (dry run), then for real; the staleness check now;
# the negative case:
gh workflow run verification-alert.yml -f run_id=<id>
gh workflow run verification-alert.yml -f run_id=<id> -f dry_run=false
gh workflow run verification-alert.yml -f dry_run=false
gh workflow run nightly.yml -f force_failure=true
```

Before merging, dispatch `--ref ci/nightly-bug-farm` to validate on the hosted
fallback. A clean run creates no finding issues. To inspect an actual reporting
payload, use a seed from a known failing run. Scheduled runs publish findings
automatically; manual runs require `findings_dry_run=false` on main.

For local replay, check out the issue's commit and save its JSON as `model.json`.
Build once and locate the exact metamorphic executable (honors target overrides):

```sh
cargo build --release --example solve_json
cargo test --release --test metamorphic --no-run --message-format=json > /tmp/nightly-build.jsonl
export NIGHTLY_REPLAY_BIN="$(python3 -c 'import json; rows=[json.loads(l) for l in open("/tmp/nightly-build.jsonl")]; print(next(r["executable"] for r in rows if r.get("executable") and r.get("target",{}).get("name")=="metamorphic"))')"
python3 scripts/nightly-models.py --model model.json --seed SEED_FROM_ISSUE --check metamorphic --count 1
```

Use the issue's `--check opensees` or `--check codeaster` for reference failures;
install the reference as described in its tools README first. For Code_Aster,
set `ASTER_PYTHON` to its native Python. Fuzz issues supply their cargo-fuzz
command. Property logs print the minimized proptest arguments; reproduce with
`PROPTEST_RNG_SEED=<seed> PROPTEST_CASES=10000 cargo test --release --test certificates properties_ -- --nocapture`.

Other scheduled workflows (`verify.yml`, `differential.yml`, `mutation-ts.yml`,
`supply-chain.yml`) keep their existing routing and budgets. Workflow validation
for this change is syntax-only; no engine or web tests are run on the laptop.
