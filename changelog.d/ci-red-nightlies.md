### Added
#### A scheduled job that stays red opens an issue (2026-11-06)

- A daily workflow, Red nightlies (`.github/workflows/red-nightlies.yml`), reads the last scheduled
  runs on main of every scheduled workflow, job by job (matrix shards together). A job whose last
  two scheduled runs failed, timed out, or were cancelled by GitHub for exceeding their timeout
  opens one issue titled `Stays red: <workflow> / <job>`, labelled `nightly-red` and assigned to
  unbalancedparentheses and Batuis; later red runs comment on it, and the first green run closes
  it. The OpenSees comparison had been timing out every night since 21 October unnoticed: the
  workflow-level alert only said that Nightly verification as a whole was red.
