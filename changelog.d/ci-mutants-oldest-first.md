### Changed
#### A mutation-testing shard that does not finish no longer waits 16 nights for its turn (2026-11-05)

The nightly mutation run picks the 32 shards that went longest without running to their verdict,
instead of a fixed block by day. A shard lost to a runner failure or to its time budget used to
wait for the next full pass, 16 nights later; it now runs again before any shard with a newer
report, so the 16-night coverage promise does not silently slip when a night loses shards.
