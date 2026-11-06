### Performance

#### Kani proofs run in five CI shards (2026-11-06)

The Verify workflow now assigns the Kani harnesses deterministically across five runners, with each runner still checking one harness at a time under the existing watchdog, tier, unwind and solver settings. The required `kani` check passes only after every shard reports success; a failed, cancelled, skipped or missing shard fails the check.
