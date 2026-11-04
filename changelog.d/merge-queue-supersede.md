### Fixed
#### A rebuilt merge-queue entry cancels its own superseded run (2026-11-02)

When the merge queue rebuilds, GitHub starts a new run for each entry on its new base but
leaves the old runs going, and they held the CI runners. Every merge-queue run now first
cancels the unfinished merge-queue runs of CI, supply chain and verification whose head is no
longer in the queue. A run whose head is still a queue entry or a queue branch, such as another
pull request's entry, is never cancelled, and nothing is cancelled unless three snapshots of the
queue agree.
