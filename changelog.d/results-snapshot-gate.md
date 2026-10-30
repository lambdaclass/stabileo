### Added
#### Results snapshot gate: a pull request that changes a result must say so (2026-10-28)

A reference corpus of 39 projects (the bundled examples in Basic 2D, Basic 3D and PRO; shells,
combinations, P-Δ, modal, spectral and buckling; the CIRSOC 201, CIRSOC 301 and footing checks with
PRO's design on) is solved through the app's own solve and design path on every pull request and
in the merge queue, and compared with committed snapshots (`web/results-snapshots/`) to one part
per million. A pull request whose snapshots move must add an entry to the registry of result
changes and a `BREAKING (results)` changelog fragment, so the engineers whose projects it affects
are told when they open them; `make snapshots-update` regenerates the snapshots. Nothing an
engineer sees changes (#716).
