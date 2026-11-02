### Changed
#### A lighter merge queue, with a revert when main fails (2026-11-02)

The merge queue now runs what combining PRs can break and skips the heavy jobs that
it rarely breaks: slow E2E, visual baselines, Docker build smoke, Determinism,
quarantined E2E and research validation beyond route budgets. Pushes to main and a
new nightly CI run (03:30 UTC) still run everything. When a push to main fails twice,
a post-merge workflow opens a signed revert PR of the merges since the last green
push and notifies the ntfy topic. Once approved and green, it jumps the merge queue.
