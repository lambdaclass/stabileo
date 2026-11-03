### Changed
#### Every Rust mutant is tested at least every 16 days (2026-11-02)

The nightly mutation run now tests 32 of its 512 shards a night instead of 4, on the nightly
runner pool, so a full pass takes 16 nights, as the roadmap promises, instead of 128. A shard
that runs to its verdict leaves a marker, and the weekly verification dashboard fails and lists
the stale shards when any shard has gone more than 16 days without one. The dashboard's Rust
mutation score now reads the nightly workflow, where the mutants job runs.
