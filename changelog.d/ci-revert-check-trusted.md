### Security
#### Revert Check also runs from a definition the pull request cannot edit (2026-11-08)

  run (`workflow_run`), always from the base branch: the base's workflow, the base's checker
  (`.github/scripts/revert-check-trusted.sh`, `revert-check.py`), and the pull request's commits
  only fetched as data, never checked out or run. The job that reads them has a read-only token;
  two small jobs with only `statuses: write`, and no checkout, set the `Revert Check (trusted)`
  commit status on the pull request's head or the queue group's head. Labels are read live, and a
  `reverts-ok` label that cannot be read live never counts. Editing `ci.yml` or the checker in a
  pull request no longer skips this check once the status is required.
