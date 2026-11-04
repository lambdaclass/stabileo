### Fixed
#### The Lean, symbolic and Kani proofs run in the merge queue (2026-11-02)

The verification workflow had no merge-queue trigger, so its proof checks never reported for
queued PRs. Each queue entry now diffs its base against its head and runs the proofs (Kani's fast
tier) when it touches what they cover, as pull requests already did; if the diff fails, the proofs
run anyway. A test requires every workflow that provides a required check to run in the merge queue.
