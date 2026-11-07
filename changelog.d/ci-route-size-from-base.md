### Fixed
#### The route-size check measures a pull request with main's script and budgets (2026-11-06)

- The Landing and app route byte budgets job copied the pull request's measurement script over
  main's before measuring main, so a branch carrying an old copy measured main's newer code with
  old rules and failed for reasons it did not cause (#1593 and #1600). The job now measures both
  main and the pull request with main's (or the merge queue base's) `web/scripts`, placed in
  `web/.route-base` by `.github/scripts/route-size-from-base.sh`; the pull request's own
  `research-route-allowances.json` is used only when the pull request changes it. No budget changed.
