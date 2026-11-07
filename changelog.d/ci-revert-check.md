### Added
#### Revert Check: a pull request cannot silently undo newer work on main (2026-11-06)

- A new pull-request job, Revert Check, runs the base branch's copy of the checker (`make check.reverts`
  locally), simulates the merge into the base branch and blames every line it deletes. It fails, listing file, line count, commit, date and
  subject, when the merge deletes lines written in the last 21 days that the branch never started
  from and did not write: lines that reached it only by merging the base, then went missing, as a
  stale conflict resolution does. Edits to lines the branch started from, its own lines and older
  lines pass. The `reverts-ok` label acknowledges an intended removal: the job reads the pull
  request's labels when it runs, and adding or removing the label reruns it (and CI OK) once the
  head's CI run has finished, with no push.
  A merge that conflicts fails and names the files. The merge queue runs it too, on each
  pull request in the queued group against the group before it, with that pull request's own labels;
  a group commit that is not GitHub's merge of a pull request's current head fails.
