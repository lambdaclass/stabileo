### Changed
#### Pull request CI reruns infrastructure failures once by itself (2026-11-04)

When every failed job of a pull request's CI, Research or Supply chain run shows infrastructure
evidence (a job timeout, a lost runner, exit 137, or a cache, artifact or network error in a
download step), its failed jobs are rerun once automatically, and the run summary records why.
Test, build and lint failures are never retried, nor is anything unrecognised.
