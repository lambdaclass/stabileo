### Fixed
#### A pull request run cancelled by a newer one no longer shows a red CI OK (2026-11-04)

When a newer pull-request run cancelled an older one, the older run's CI OK still ran and failed
on the cancelled jobs, so the pull request looked red while the real run was still queued. This
happened to every course pull request at 18:30 UTC on 2026-11-04 (for example #1303, run
41887856500). On a pull request, a cancelled run now skips CI OK. Merge-queue, main and scheduled
runs still report CI OK when cancelled, because a skipped required check would pass.
