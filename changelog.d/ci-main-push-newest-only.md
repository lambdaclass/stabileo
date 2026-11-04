### Changed
#### Only the newest main commit runs post-merge CI and proofs (2026-11-04)

When merges land close together, each push to main ran the whole post-merge CI and Verify
workflows, even though the next push contains the same commits. Between 06:00 and 18:15 UTC on
2026-11-04, 598 CI job-minutes and 430 Verify job-minutes ran after a newer main push had already
started. These runs held the self-hosted runners while the merge queue waited. A push to main now
cancels the main run still in progress in each of the two workflows. Merge-queue, scheduled and
dispatched runs are never cancelled this way. Deploy runs in its own workflow and is unaffected.
The post-merge revert ignores cancelled runs and blames every merge since the last green one.
