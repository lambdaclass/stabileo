### Fixed
#### Keep gravity notice checks valid after merge and ignore load provenance in physical fingerprints (2026-11-17)

Check the exact gravity regeneration notices independently of branch-assigned
results versions, while retaining chronological ordering checks. Exclude
`floorLoadsVersion`, alongside `memberLoadsVersion`, from both physical load
fingerprint totals and per-target records. Stamp changes no longer report a
physical model migration; changes to load values and targets remain detected.
Engine results, baselines and tolerances are unchanged.
