# Testing cadence

Which tests run on every pull request, and which daily, weekly and monthly. The fast checks
guard every change; the slow ones (exhaustive invariance, fuzzing, mutation testing, external
references) run on a schedule, and a failure there turns into an issue with an owner instead of
blocking a pull request.

The source of truth is [`.github/test-cadence.json`](../.github/test-cadence.json). Every check
in it has an id (the backticked names below), and `make check.cadence` (part of
`make test.ci-scripts`, so CI runs it) fails when a check's make target or workflow job does not
exist, or when this page lists a check under another tier than the manifest, or not at all. A check is either:

- **run by the cadence runner**: it names a make target, and `make test.cadence TIER=<tier>`
  runs it in the Engine Quick Checks job of `ci.yml` (pull requests) or the `cadence` job of
  `nightly.yml` (daily, weekly, monthly). A check marked `optional` whose target is not on the
  branch yet is skipped with a notice, so a target is listed here before the pull request that
  adds it lands, and runs from the first night after it does.
- **run by an existing workflow job**: it names that job, and the manifest only records its tier.

## Tiers

| Tier | Trigger | Budget | What a failure does | Owner |
|---|---|---|---|---|
| Every PR | every pull request and merge-queue entry, scoped to the changed paths (`select-ci.py`) | the critical path, about 22 min; the newer checks add none to it | blocks the pull request (`CI OK` is required) | the pull request's author |
| Daily | `nightly.yml` at 00:00 UTC, and the other daily workflows, in the 00:00–07:00 UTC window | the window | opens or updates the workflow's `ci-failure` issue; each real finding gets its own issue; new wrong-result candidates are triaged the same morning | the decision owners |
| Weekly | Sunday's `nightly.yml` run (UTC); route size and research replays on Monday | the window | opens or updates an issue: `ci-failure`, the mutants ratchet, `route-size`, the flaky-test report | the decision owners |
| Monthly | the `nightly.yml` run on the 1st of the month (UTC) | the window | opens or updates an issue: `ci-failure`, the dependency audit | the decision owners |

Scheduled runs never take the merge queue's runners (#1348): every scheduled job runs on the
runners reserved for scheduled work, or on GitHub-hosted runners, and
`scripts/tests/test_ci_runners.py` checks every scheduled job's `runs-on` to keep it that way.

### Every PR

Fastest first: path selection (seconds), lint and typecheck, then the unit tests, the engine
gates and suite shards, the end-to-end smoke shards and determinism, all in parallel.

| Check | Where | What |
|---|---|---|
| `lint` | ci.yml Lint Engine, Lint Repo, Lint Backend | clippy, pins, changelog fragments, backend format |
| `typecheck` | ci.yml Web Build | tsc and svelte-check gates |
| `unit` | ci.yml Web Unit | Vitest, 4 shards |
| `engine-gates` | ci.yml Engine Gates | named correctness gates |
| `engine-suite` | ci.yml Engine Suite | every other engine test, 4 shards |
| `engine-metamorphic` | ci.yml Engine Metamorphic | metamorphic tests, sampled tier |
| `e2e-smoke` | ci.yml E2E | Playwright smoke suite |
| `determinism` | ci.yml Determinism | WASM bit-identical in Node and three browsers |
| `differential-quick` | Engine Quick Checks | `make test.engine.differential.quick`: cross-method differential tests |
| `invariance-quick` | ci.yml Engine Metamorphic | `make test.engine.invariance.quick BASE=HEAD^1`: invariance of the analyses the change touches, on the release build that job already has |
| `mechanism-fuzz-quick` | Engine Quick Checks | `make test.engine.mechanism-fuzz.quick` |
| `issue-reproducers` | Engine Quick Checks | `make test.engine.reproducers`: every expected-failure reproducer still fails ([WORKFLOW.md](WORKFLOW.md), "Wrong-result reproducers") |
| `issue-reproducer-flip` | issue-reproducers.yml | a pull request that says `Fixes #N` for a wrong-result issue flips #N's reproducers |

Engine Quick Checks starts with the other engine jobs, which finish 10 to 15 minutes before
the web jobs that set the critical path. Each of its checks has a budget of
8 to 10 minutes (`budget_min` in the manifest; the runner stops a check that overruns it), and the job's
time limit is the sum of the budgets of the checks it runs. The
budget covers building the check's test binary, which is most of its time; the dependencies come
from the job's Rust cache. A check that needs the release build the Engine Metamorphic job
already makes runs there instead (`invariance-quick`). If the job's checks together start to
end after the web jobs, move the slowest to its own job.
Until one of its targets lands, the job only reads the manifest and builds nothing.

### Daily

| Check | Where | What |
|---|---|---|
| `metamorphic-full` | nightly.yml metamorphic-nightly | metamorphic and invariance, exhaustive tier |
| `invariance-full` | nightly.yml cadence | `make test.engine.invariance.full` |
| `differential-full` | nightly.yml cadence | `make test.engine.differential.full` |
| `mechanism-fuzz` | nightly.yml cadence | `make test.engine.mechanism-fuzz.long DURATION=45m`, from a new seed each day |
| `containment-audit` | nightly.yml cadence | `make check.containment`: every open wrong-result issue is contained |
| `lighthouse` | performance.yml | Lighthouse against the deployed site |
| `external-references-sampled` | nightly.yml opensees-diff, codeaster-diff | OpenSees and Code_Aster at the daily counts |
| `other-differential` | differential.yml | Frame3DD, PyNite, Mystran, Kratos, CalculiX |
| `fuzz` | nightly.yml fuzz | coverage-guided fuzzing of the JSON entry points |
| `mutants-rotation` | nightly.yml mutants | 32 of the 512 mutants shards (certificates, solver core, element kernels) |
| `proofs` | verify.yml | Lean, Kani and symbolic proofs |
| `triage` | nightly.yml triage | the daily triage report |

**Daily triage.** The nightly `findings` job opens one issue per root cause, labelled
`wrong-result-candidate` when a result may be wrong. The `triage` job then assigns the decision
owners to every open candidate and lists the day's new ones, and the ones that recurred overnight, on the **Daily triage report** issue
(nothing is posted on a quiet day). For each candidate the owners decide within the day: confirm
it (label `safety`, contain it, add its reproducer as an expected-failure test named after the
issue) or close it as a harness artefact with the evidence.

### Weekly

| Check | Where | What |
|---|---|---|
| `mutants-safety` | nightly.yml mutants-safety, mutants-ratchet (Sunday, GitHub-hosted) | mutation testing of the safety-critical modules ([FUZZ_MUTANTS.md](verification/FUZZ_MUTANTS.md#safety-critical-scope-weekly)); a kill rate below the baseline opens or updates the **Mutation kill rate below baseline** issue |
| `fuzz-long` | nightly.yml fuzz (Sunday) | each fuzz target for 5 hours instead of 2 |
| `mechanism-fuzz-long` | nightly.yml cadence | `make test.engine.mechanism-fuzz.long DURATION=4h`, from a new seed each week |
| `route-size` | route-size.yml (Monday) | landing and /app footprints against their ceilings |
| `research-replays` | research.yml (Monday schedule) | every research paper's validation replays |
| `flaky-report` | nightly.yml flaky-report (Sunday) | the **Weekly flaky-test report** issue |

The flaky-test report counts, for the past seven days of `ci.yml` runs, every job that both
failed and passed on the same commit (a rerun, or another run of that commit), and lists the
quarantined (`@flaky`) tests. The issue is rewritten each week.

### Monthly

| Check | Where | What |
|---|---|---|
| `mutants-full` | nightly.yml mutants-monthly (the 1st) | the full-engine pass: the daily rotation tests every mutant once every 16 nights; the **Monthly mutation report** issue gives the kill rate per area from the last 16 nights' shards |
| `external-references-full` | nightly.yml opensees-diff, codeaster-diff (the 1st) | three times the daily counts of random models |
| `deps-audit` | nightly.yml deps-audit (the 1st) | the **Monthly dependency audit** issue: semver-incompatible Rust releases, npm packages behind a major, Dependabot pull requests open for more than 30 days |
| `results-snapshots` | nightly.yml cadence | `make test.web.results` against main |
| `results-change-reproducers` | nightly.yml cadence | `make test.reproducers.published`: every published results change's reproducers against main |

## Running a tier by hand

    make test.cadence TIER=pr                       # every pull-request check that runs through the manifest
    make test.cadence TIER=daily ID=mechanism-fuzz  # one check
    gh workflow run nightly.yml -f tiers=weekly -f only='cadence flaky-report'

A dispatched `nightly.yml` runs the daily tier plus the tiers named in `tiers`; the weekly and
monthly jobs run only on their night unless `only` names them.

## Adding a check

Add an entry to `.github/test-cadence.json` with its tier, a make target (or the existing job
that runs it), a budget and a line on what it checks, and a row to the tier's table here. A
pull-request check must fit its budget on a GitHub-hosted runner; anything slower belongs in the
daily tier. `make check.cadence` fails until both are in.

## Owners

Every issue a scheduled check opens (the `ci-failure` issues, nightly findings, the triage, flaky,
dependency and mutants reports, route size) is assigned to the decision owners listed in
[`.github/scripts/issue-assignees.cjs`](../.github/scripts/issue-assignees.cjs), who decide what
happens to it. A pull-request failure belongs to the pull request's author.
