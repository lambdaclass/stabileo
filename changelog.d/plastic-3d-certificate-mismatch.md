### BREAKING (results)
#### Checked 3D plastic analysis refuses a factor outside its certificate (2026-11-10)

The combined `certify_plastic_3d` API now refuses `PL-3D-CERTIFICATE-MISMATCH` when the incremental factor is outside the exact bounds. The incremental biaxial hinge approximation can produce a conservative lower bound; its existing warning and the independent exact certificate remain available through their separate APIs. Details: [results change](../docs/results-changes/2026-11-plastic-3d-certificate-mismatch.md) and [SA-2026-057](../docs/advisories/SA-2026-057-plastic-3d-checked-factor.md).
