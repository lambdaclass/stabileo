### Fixed
#### Results Snapshot keeps the full registry history in the merge queue (2026-11-10)

Fetching the merge-queue base no longer makes the checkout shallow. The Results Snapshot gate
can read the first-parent history that assigns results versions, so a registered result change
is no longer rejected because the registry introduction appears to have no parent.
