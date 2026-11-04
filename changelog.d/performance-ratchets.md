### Performance
#### Lighthouse scores can only get better without a recorded decision (2026-11-01)

A daily workflow runs Lighthouse against stabileo.com (median of five, mobile and desktop) and opens
an issue when a score moves beyond its margin from `web/perf-lighthouse.json`: down is a
regression, up is an improvement to record. Measured baselines, margins and the audit are in
`docs/performance/`.
