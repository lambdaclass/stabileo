### Fixed
#### Long-lived PRs can use production parity checks added to their target branch (2026-11-27)

CI runs the parity checker from the workflow checkout and builds the merge base and PR head as separate source snapshots. A PR can now pass planning even when its own Makefile predates the parity target.
