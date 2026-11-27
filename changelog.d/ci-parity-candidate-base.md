### Fixed
#### Production parity checks use the candidate's common ancestor with main by default (2026-11-27)

Running the parity check with only `CANDIDATE` now compares against its merge base with `origin/main`. A lockfile change made only on main can no longer reject a valid switch-only change. CI checks that supply both revisions still use the exact base they received.
