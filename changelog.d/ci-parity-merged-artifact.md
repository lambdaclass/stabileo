### Fixed
#### Production parity checks the merged site and accepts pre-manifest branches (2026-11-27)

Pull requests select switch-off parity from their own changes. Required builds now compare the workflow merge with its first parent, so a target-side build change that publishes a file edited by the PR is included. The merge queue checks the queued artifact against its recorded base. Planning also recognizes historical web builds that predate the feature manifest.
