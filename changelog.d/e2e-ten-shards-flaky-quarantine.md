### Changed
#### E2E runs in ten duration-balanced shards, and flaky tests have a quarantine (2026-10-23)

CI's end-to-end suite runs in ten shards instead of five, and the slow suite (the merge queue's)
is now balanced by measured duration like the smoke suite: `--shard=N/5` split it by test count
and left the Basic advanced sweep, 54 of its 120 minutes, in one shard (49 min there, 6 in the
lightest). The sweep is seven spec files now, none over ten minutes, over one shared harness
(`web/e2e/basic-advanced-sweep.ts`); no test was added or removed. The required checks are
`e2e (1)` to `e2e (10)`.

A test tagged `@flaky` is left out of the blocking runs and runs in the non-required `e2e-flaky`
job with two retries; the tag requires a linked issue (`web/e2e/README.md`). The Basic advanced
sweep's `tower-3d-2` is quarantined (#607: the mode-shape motion check reads too little on CI;
its frames now span a whole period before calling a shape still). The rebar workspace's
"restored proposal is PROVISIONAL" test is fixed instead: its poll gave up after 10 s while the
page was busy for 40 s after the filter press (#608 tracks the freeze itself).
