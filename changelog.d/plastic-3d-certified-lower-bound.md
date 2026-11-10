### BREAKING (results)
#### Checked 3D plastic analysis returns the certified lower bound (2026-11-10)

The combined `certify_plastic_3d` API returns the sound exact interval's lower bound as `collapseFactor`, preserving the raw incremental factor and reporting a conservative mismatch as a warning. All thirteen 3D plastic LP artifacts now return their certified lower bounds. The API refuses missing sound certificates and raw factors strictly above the interval, including roundoff. The result shape, raw steps and hinges, and separate raw solver remain unchanged. See the [results change](../docs/results-changes/2026-11-plastic-3d-certified-lower-bound.md) and [engine wrong-result reproducer](../docs/verification/PLASTIC_3D_RAW_FACTOR.md).
