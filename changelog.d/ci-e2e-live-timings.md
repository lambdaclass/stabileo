### Changed
#### E2E shards balance from times measured on recent main and merge-queue runs (2026-11-05)

Each main and merge-queue run that passes the full E2E smoke suite now saves how long every spec file
took. The next runs split the smoke specs across their shards from that measured table instead of the
committed one, so the shards finish closer together as specs grow or get faster. A run that cannot
find a recent table uses the committed one, and every shard always reads the same table, so each spec
still runs exactly once.
