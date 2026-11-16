### Fixed
#### Generated member loads use geometric endpoints (2026-11-16)

Influence loading and planar plastic hinge splits now retain distributed member loads at the actual member endpoints without numerical overhangs. Plastic analysis propagates invalid or unavailable kinematic checks as errors. The buckling comparison fixture now partitions against its actual mesh nodes. No input bound or acceptance limit changed. The independent applied-load check detects missing net force; it does not independently detect a missing pure couple. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2223, #2222).
