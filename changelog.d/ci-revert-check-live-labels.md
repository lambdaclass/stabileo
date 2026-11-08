### Changed
#### Revert Check reads the labels live, and the reverts-ok label reruns it without a push (2026-11-08)

- Revert Check reads the pull request's labels when it runs, so a re-run sees a label added after
  the run started. A `reverts-ok` label it cannot read live never acknowledges: the check fails
  until it is re-run. On a branch of this repository, adding or removing the label reruns Revert
  Check (and CI OK) once the head's CI run has finished; from a fork, re-run the job by hand.
