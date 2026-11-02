### Performance
#### Route sizes and Lighthouse scores can only get better without a recorded decision (2026-11-01)

CI's Web Build fails when what a route downloads before it is usable (gzip, the landing, a blog
post and `/app/basic`; engine WASM excluded) grows or shrinks by more than 64 bytes against
`web/perf-budget.json`: growth is recorded with `make perf.budget.accept` and a reason in the pull
request, shrinkage with `make perf.budget.write`. A daily workflow runs Lighthouse against
stabileo.com (median of five, mobile and desktop) and opens an issue when a score moves beyond its
margin from `web/perf-lighthouse.json`: down is a regression, up is an improvement to record. Measured baselines, margins and the audit are in `docs/performance/`.
