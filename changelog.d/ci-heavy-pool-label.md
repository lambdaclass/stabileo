### Changed
#### Heavy dispatches get their own runners, and Runner Pools watches the engine pool (2026-11-08)

- The `pool` input of `nightly.yml` is now `stabileo-heavy` (the default), `nightly` or
  `ubuntu-24.04`. `stabileo-heavy` runs `opensees-diff` on stabileo-ci-1's sgha7-8 only, the
  runners that carry the `stabileo-heavy` label, so a daytime dispatch never takes the merge
  queue's engine runners. It still uses the nightly pool from 00:00 to 07:00 UTC. To dispatch:
  `gh workflow run nightly.yml --ref main -f only=opensees-diff -f pool=stabileo-heavy`.
- Runner Pools fails when fewer than 6 runners carrying `stabileo-engine` are online (7 today; the
  3 left on concrete-ci-3 are what made the merge queue wait 84 minutes) or fewer than 2 carrying
  `stabileo-heavy`.
