### Changed
#### The merge queue's longest chain is shorter (2026-11-04)

The end-to-end smoke suite runs in fourteen shards instead of ten, balanced from fresh timings (the
old table predicted 41.5 min of tests where the queue ran 69.8, so one shard took 11.7 min and
another 3.0). GitHub-hosted jobs free their disk space in the background instead of waiting about
2.5 minutes for it. With `STABILEO_ENGINE_POOL` set, the engine suite and metamorphic tests run on
their own runners, so WASM, research WASM and the end-to-end site start without waiting.
