### BREAKING (results)

#### Keep settlement references and initial shaft stiffness continuous

- Preserve exact coincident-model scaling after translation, retain support-to-free references alongside small loads and during continuation unloading, and solve nonzero tiny displacement-control targets.
- Linearize the initial t-z shaft segment consistently and flag saved 3D per-case imposed-displacement results for recheck (#761, PR #1940). See [the results-change record](docs/results-changes/2026-11-continuous-settlement-reference.md).
