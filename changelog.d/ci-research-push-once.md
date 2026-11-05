### Changed
#### Research validation runs once per merged commit and leaves the merge queue's runners free (2026-11-05)

A commit merged to main used to run every research validation twice: once from CI and once from the
standalone Research workflow. The standalone workflow now runs only its online catalog check on push
(and everything on its weekly schedule). CI's run covers the rest, and the research filter in CI
selects every path that used to trigger the standalone run. These post-merge research jobs also no
longer take the runners kept for the merge queue, so queued pull requests wait less for a runner.
