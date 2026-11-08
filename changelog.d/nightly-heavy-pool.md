### Changed
#### A dispatched OpenSees run can use stabileo-ci-1 outside the nightly window (2026-11-08)

- `nightly.yml` has a new `pool` input (`stabileo-pr`, the default, or `nightly` or `ubuntu-24.04`)
  that picks where `opensees-diff` runs. `stabileo-pr` puts it on stabileo-ci-1 from 07:00 to
  24:00 UTC and on the nightly pool from 00:00 to 07:00 UTC. Scheduled runs always use the nightly
  pool. To dispatch it: `gh workflow run nightly.yml --ref main -f only=opensees-diff -f pool=stabileo-pr`.
