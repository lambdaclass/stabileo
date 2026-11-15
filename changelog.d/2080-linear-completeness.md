### Fixed

#### Check concurrent-demand coverage without repeated scans

- Index available combination IDs and member station results once, so coverage validation scales with the tuples and combinations supplied. Preserve missing-data refusals and every station check, and remove stale peak-fallback documentation. Engineering results and the IFC test timeout are unchanged (#2080).
