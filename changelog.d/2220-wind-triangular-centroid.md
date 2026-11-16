### BREAKING (results)
#### Triangular wind symmetry and band torque support (2026-11-16)

Wind generation now refuses triangular carrier plans without symmetry about
the wind direction, preventing the branch's equal-thirds partition from
silently shifting the projected pressure centroid. Unloaded unsupported bands
no longer disable representable eccentric member loads on supported bands.
Every sign and tower carrier tip is checked with its own load share.
Regenerate W/Wa and rerun analyses, combinations and design checks. See the
[results-change record](../docs/results-changes/2026-11-wind-triangular-centroid.md).
