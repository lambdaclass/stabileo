### Changed
#### Pull requests run end-to-end tests in five shards (2026-11-04)

A pull request now runs the full end-to-end smoke suite on five hosted runners instead of ten.
Every spec still runs. The merge queue, main and the `run-e2e` label keep ten shards. The PR's
longest path is the web build then the Docker smoke test (about 40 min), and five shards take
about 21 min, so feedback is no slower and each PR leaves five hosted runners free.
