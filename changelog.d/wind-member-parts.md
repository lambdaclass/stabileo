### Fixed
#### Generated wind preserves interior diagram accuracy on strongly curved pressure bands (2026-11-27)

The wind generator integrates each declared curvature interval before fitting member loads.
A narrow peak now contributes to the resultant even when it falls between quadrature stations.
For pressure bands with known curvature breaks, both single loads and pairs must satisfy
the interior cut-force bound. Regenerate W and Wa and rerun dependent analyses and checks.
[Results change](../docs/results-changes/2026-11-wind-two-part-moments.md)
