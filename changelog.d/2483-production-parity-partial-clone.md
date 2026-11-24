### Fixed
#### Production parity works with partial Git clones (2026-11-22)

The production parity check retrieves missing reference files through the CI checkout’s Git remote before building and comparing the reference and candidate.
