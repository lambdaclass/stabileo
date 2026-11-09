### BREAKING (results)
#### Moving-load envelopes use interior force limits at member ends (2026-11-09)

2D and 3D moving-load axial/shear envelopes now exclude force limits outside the member when a point load lies exactly at either end (#1782, PR #1783). A load carried entirely by a support could previously appear as member force. Re-run affected envelopes and review sizing based on them. See [the results change](../docs/results-changes/2026-11-moving-load-endpoint-forces.md) and [SA-2026-053](../docs/advisories/SA-2026-053-moving-load-endpoint-forces.md).
