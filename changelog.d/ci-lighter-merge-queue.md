### Changed
#### A lighter merge queue, with a revert when main fails (2026-11-02)

The merge queue now runs what combining PRs can break and skips the heavy jobs that
it rarely breaks: slow E2E, visual baselines, Docker build smoke, Determinism,
quarantined E2E and research validation beyond route budgets. Pushes to main and a
new nightly CI run (03:30 UTC) still run everything. When a push to main fails twice,
a post-merge workflow opens a signed revert PR of the merges since the last green
push and notifies the ntfy topic. Once approved and green, it jumps the merge queue.

Browser jobs (E2E, E2E Site and the quarantined E2E) can be limited to a smaller set of runners
labelled `stabileo-e2e` once the repository variable `STABILEO_E2E_POOL` is `true`, so a host no
longer runs a dozen headless Chromes at once; without it they stay on the `stabileo` pool.

The self-hosted runners take only the merge queue and runs on `main` (pushes, the nightly run
and manual runs of `main`); a manual run of any other branch goes to GitHub-hosted runners.
