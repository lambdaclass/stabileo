### Fixed
#### Wall-clock budgets run only on a dedicated hosted VM, never on the shared runners (2026-11-03)

The merge queue already skipped the wall-clock assertions on the shared self-hosted runners and
checked them in the Timing Budgets job on a GitHub-hosted VM. Pushes to main and pull requests
on the self-hosted pool now do the same: every self-hosted Web Build and slow E2E step skips the
wall-clock assertions, and Timing Budgets runs for those events too, so a loaded runner can no
longer fail main and trigger a revert. Pull requests on GitHub-hosted runners check the budgets
in Web Build as before. The fixtures and the budgets are unchanged.
