### BREAKING (results)
#### Moving-load axial envelopes evaluate every distributed-load boundary (2026-11-08)

2D and 3D moving-load axial envelopes now evaluate every distributed-load start and end boundary alongside the existing sign roots. Short opposite-sign patches could previously report a zero envelope despite an interior axial force (#1782, PR #1783). Re-run affected envelopes and any design or sizing based on their axial extrema. See [the results change](../docs/results-changes/2026-11-moving-axial-patch-boundaries.md) and [SA-2026-052](../docs/advisories/SA-2026-052-moving-axial-patch-boundaries.md). The 3D re-check notice now requires saved moving-load position cases, and negative tests guard the plastic certificate's refusal of axial point loads.
