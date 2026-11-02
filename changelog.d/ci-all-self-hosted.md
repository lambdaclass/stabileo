### Changed
#### CI runs on Stabileo's own runners, and superseded runs cancel themselves (2026-11-02)

With `STABILEO_SELF_HOSTED` on, every CI job that builds or tests runs on the
self-hosted stabileo-ci-1 runners for the merge queue and pushes to main, and,
with `STABILEO_PR_POOL`, for pull requests from this repository's branches (on
`stabileo-pr` runners, so the merge queue always keeps runners of its own). Fork
and Dependabot pull requests stay on GitHub. The timing-sensitive jobs (Engine
Gates, Web Unit, research engine benchmarks) move only to pinned `stabileo-timing`
runners (`STABILEO_TIMING_POOL`), and nightly fuzzing only to `stabileo-nightly`
runners (`STABILEO_NIGHTLY_POOL`). A merge-group run whose PR left or was rebuilt
in the queue is cancelled. Main and nightly runs are never cancelled. Every job has
a timeout. Engine Suite and Web Unit now run in four shards each.
