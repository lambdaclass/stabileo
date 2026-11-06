### Added
#### Revert Check: a pull request cannot silently undo newer work on main (2026-11-06)

- A new pull-request job, Revert Check (`make check.reverts`), simulates the merge into the base
  branch and blames every line it deletes. It fails, listing file, line count, commit, date and
  subject, when the merge deletes lines written in the last 21 days that the branch never started
  from and did not write: lines that reached it only by merging the base, then went missing, as a
  stale conflict resolution does. Edits to lines the branch started from, its own lines and older
  lines pass. The `reverts-ok` label acknowledges an intended removal (push, or re-run all jobs,
  after adding it).
  A merge that conflicts fails and names the files. The merge queue does not run it.
