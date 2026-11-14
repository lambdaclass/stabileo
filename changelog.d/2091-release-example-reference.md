### Fixed
#### Legacy example comparisons use the release's recorded defaults (2026-11-14)

Saved projects are compared with the release's fixture and default material and section, verified against its recorded commit. New default fields cannot enter an older reference. Both models still use the current loader and solver, and the exact material/section fingerprint still rejects lost or changed saved strengths. No corpus, tolerance, project migration, design check or engine result changed (#2091, #1318).
