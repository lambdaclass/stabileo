### BREAKING (results)
#### Checked 3D plastic analysis returns the certified lower bound (2026-11-10)

The combined `certify_plastic_3d` API now reports the certified lower bound as `collapseFactor` whenever a sound finite ordered interval exists, whichever side of the interval the raw factor falls on. It preserves the raw factor and reports mismatches in either direction as warnings. It refuses when no sound certificate is available. See the [results change](../docs/results-changes/2026-11-plastic-3d-certified-lower-bound.md).
