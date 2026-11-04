### Changed
#### E2E shards run on GitHub's runners again (2026-11-03)

The E2E shards (and quarantined E2E) always run on GitHub-hosted runners: all ten start at
once and take about 11 minutes, against about 18 minutes and a queue on the shared self-hosted
host. The site they test is still built once on the self-hosted runners.
