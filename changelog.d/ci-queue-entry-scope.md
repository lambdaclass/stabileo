### Changed
#### Each merge-queue entry is scoped by its own change (2026-11-04)

A merge-queue run now picks its scope (full, site, docs) from the diff against
the entry ahead of it, not against main, so a docs or site change queued behind
an engine change no longer runs the whole engine pipeline again. The entry ahead
tests everything it brings and must pass before this one merges. A run whose
history can't be read still falls back to the full pipeline.
