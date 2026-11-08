### Changed
#### Heavy dispatches get their own runners, and Runner Pools watches the engine pool (2026-11-08)

- Heavy daytime dispatches (`nightly.yml`'s `pool=stabileo-heavy`) run only on stabileo-ci-1's
  sgha7-8, the runners that carry `stabileo-heavy`, so they never take the merge queue's engine runners.
- Runner Pools fails when fewer than 6 runners carrying `stabileo-engine` are online (7 today; the
  3 left on concrete-ci-3 are what made the merge queue wait 84 minutes) or fewer than 2 carrying
  `stabileo-heavy`.
