### Changed
#### Pull requests take the self-hosted runners only for their critical-path builds (2026-11-03)

A pull request's WASM, Research WASM and e2e site builds run on the self-hosted pull request
runners, where their caches are warm; every other pull request job runs on GitHub, where thirty
start at once, instead of queueing for four runners. Checks that take a minute or less run on
GitHub for the merge queue too, leaving the self-hosted runners to the builds and test suites.
