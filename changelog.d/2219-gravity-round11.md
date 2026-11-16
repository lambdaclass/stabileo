### BREAKING (results)
#### Gravity loads retain restoration notices and checked extrema (2026-11-16)

All-zero member moments now behave like absent moments through validation,
assembly and recovery, including narrow supported force spans. Nonzero moment
supports retain the 1e-10 relative limit. Manual member-load restoration is tracked
independently of solving, so re-solving cannot erase a notice about damaged stored
loads. Restore affected loads from their original specification before re-solving.

The three affected PRO snapshots update only 80 governing moment values, each
checked against an independent stationary-point solution. See the per-value
[results-change audit](../docs/results-changes/2026-11-gravity-round11.md).
