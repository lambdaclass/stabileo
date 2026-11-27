### Fixed
#### Production parity compares a pull request with its current merge base (2026-11-27)

CI now compares the PR head with the commit it shares with the current target branch. This prevents a long-lived PR from failing production parity because it picked up a change to `Cargo.lock` from its target. The merge queue continues to use the base recorded for the group.
