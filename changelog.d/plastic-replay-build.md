### Fixed
#### Build plastic replay before script tests

Plastic replay script tests build their real replay example before running, using the same make build target as bounded replay and nightly checks. PR #1888. The build pins the output directory used by the replay scripts, including when Cargo has a target-directory override. All watchdog, certificate and allocation assertions remain active.
