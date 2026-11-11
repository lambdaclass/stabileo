### Fixed

#### Linear factorization refusals distinguish unresolved accuracy from negative stiffness

A failed Cholesky factorization after the stability check now reports unresolved numerical accuracy and returns no result. The negative-stiffness diagnosis remains reserved for confirmed negative modes. Solve/refuse decisions and numerical values are unchanged; see [the results-change write-up](../docs/results-changes/2026-11-linear-factorization-diagnostic.md).

The legacy deep-beam-shell regression now checks the exact notice list in registry order for both branch and main-first merge history. The harmonic notice still applies to legacy files with unknown analysis history, and it cannot explain an unrelated static displacement change. Seed 20761 now always requires the loaded-release refusal.
