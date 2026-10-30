# Nightly verification

The checks too slow for a pull request run every night on `main`, on GitHub-hosted runners,
and on demand from the Actions tab or with `gh workflow run <file>`.

**Alerting** (`.github/workflows/verification-alert.yml`, `.github/scripts/verification-alert.cjs`).
A failed, timed-out or cancelled scheduled run of `nightly.yml`, `differential.yml`, `verify.yml`,
`mutation-ts.yml`, `verification-dashboard.yml` or `supply-chain.yml` opens **one issue per
workflow**, titled `CI failure: <workflow>` and labelled `ci-failure`, with the run link and the
failing jobs, or comments on the one already open. The next green scheduled run closes it, so
each new red spell opens a fresh issue (which is what notifies the repository's watchers; a
comment on a months-old issue notifies nobody). Once a day (13:00 UTC) a staleness check does
the same for a workflow that has not completed a scheduled run in its window (32 h; 8 days for
the weekly dashboard), or that is disabled or renamed.

The `ci-failure` issue only says that the workflow is red. Each real finding behind it (a
differential mismatch, a metamorphic violation, a fuzz crash, a missed mutant, a failing proof)
is triaged into its own issue, labelled `bug` and also `safety` when a result could be wrong,
with its reproduction (the seed is printed in the log), and linked from the `ci-failure` issue.
Those finding issues are never closed automatically: the random seeds and the mutants shards
change every night, so a green run the next day does not mean the finding is fixed. (The
`verification-failure` issues opened per job before October 2026 are such finding issues.)

Negative case: `gh workflow run nightly.yml -f force_failure=true` (or `differential.yml`) fails
at once, without running anything, and must open `CI failure: <workflow> [forced failure]`, an
issue of its own that the real alerts never touch; close it by hand.

| Workflow | Jobs | Schedule (UTC) | Wall clock | Runner time |
|---|---|---|---|---|
| `nightly.yml` | `certify-large` | 05:00 | ~25 min | ~25 min |
| | `opensees-diff` (OpenSees, 2D/3D static, buckling, modal, P-Delta, time history, plates, shells) | | ~15 min | ~15 min |
| | `codeaster-diff` (Code_Aster 18.1, 3D linear with releases, connectors, constraints, thermal, inclined supports) | | ~10 min | ~10 min |
| | `fuzz` (4 targets × 30 min) | | ~40 min | ~2.7 h |
| | `mutants` (16 of 256 shards) | | 1-4 h | 16-40 h |
| | `bench` (criterion, informational) | | ~20 min | ~20 min |
| `differential.yml` | Frame3DD, PyNite, Mystran, Kratos, CalculiX | 04:30 | ~25 min | ~2 h |
| `verify.yml` | `lean`, `symbolic`, `kani` (nightly tier) | 05:00 | ~2 h | ~2.2 h |
| `mutation-ts.yml` | Stryker over the safety-relevant TypeScript (3322 mutants) | 03:17 | ~4.5 h | ~4.5 h |
| `supply-chain.yml` | cargo deny / audit, npm audit | 06:00 | ~2 min | ~3 min |

Total: 20 to 45 runner-hours a night, most of it mutation testing; standard
GitHub-hosted runners are free for this public repository, so the cost is runner
concurrency, not money. Everything starts between 03:00 and 06:00 UTC (night in Argentina),
when pull requests are not waiting for runners.

## Mutants rotation

`scripts/mutants.sh` covers ~23,000 mutants (certificate code, the linear solver core, the
element kernels). Each one is a rebuild of the engine and its test binaries plus a test run.
On the first scheduled run that was ~4 min per mutant (a full non-incremental rebuild with debug
info, linked by the default linker, then every test binary in turn), and no shard finished in
300 minutes. With incremental builds, no debug info, mold and nextest (which stops at the first
failing test) it is ~40 s of build and a few seconds of tests, ~22 s of wall clock per mutant with
two in parallel, for a mutant the tests catch. A mutant they miss runs the whole test set (up
to ~2 min): a shard of the linear solver with most mutants missed tested only 269 of 363 in 320
minutes at 64 shards. So the `plan` job of `nightly.yml` splits the mutants into 256 shards
(~90 each) and picks 16 each night from the day number: every mutant is tested once every 16
nights. (At 128 shards of ~200 a shard with many survivors did not fit: on 2026-10-28 shard 16,
mostly missed mutants in `dkt_b_matrix`, ran out of its budget, and shard 17 took 5 h.) Each shard has a 320-minute budget; if it does not finish, the job fails saying how far
it got (`scripts/mutants-summary.py`), and `MUTANTS_TOTAL` in `nightly.yml` must go up.

The test files are modules of a few shared binaries (`engine/tests/<binary>/main.rs`), so
`--test <binary>` alone would run every module in it for each mutant: from 2026-10-24 to -28
that doubled the baseline (155 s to ~400 s, a missed mutant ~800 s) and no shard finished.
`scripts/mutants.sh` passes nextest a filterset (`-E`) that keeps the run to the listed files.
A shard fails whenever `mutants.out/missed.txt` is not empty, whatever cargo-mutants' exit code
(it reports timeouts, 3, over missed mutants, 2).

Run particular shards by hand:

    gh workflow run nightly.yml -f only=mutants -f mutants_shards='[5,6]'
    gh workflow run nightly.yml -f only=mutants -f mutants_total=1024 -f mutants_shards='[0]'   # a quick sample (~23 mutants)

## Running a job by hand

    gh workflow run nightly.yml                          # everything
    gh workflow run nightly.yml -f only='fuzz codeaster-diff'
    gh workflow run differential.yml -f seed=744000      # reproduce a night's seeds
    gh workflow run verification-alert.yml -f run_id=<id>               # what it would report (dry run)
    gh workflow run verification-alert.yml -f run_id=<id> -f dry_run=false
    gh workflow run verification-alert.yml -f dry_run=false                # staleness check now
    gh workflow run nightly.yml -f force_failure=true                       # negative case

## What cannot run on GitHub-hosted runners

Nothing at present. Every job above installs its reference program on the runner (pip,
conda-forge, a pinned source build, or nix) and fits in a standard runner's 16 GB and
6-hour limit; Kani runs one harness at a time under a memory watchdog for that reason.
