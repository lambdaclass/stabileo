### BREAKING (results)
#### Buckling factors outside their enclosure are refused (2026-10-29)

Buckling certification now refuses a reported factor above the independently certified
upper bound, in 2D and 3D, including constrained models. It does not widen the bound or
change the raw solver estimate. Re-run certification before relying on an earlier
buckling certificate. Issue #741; PR #817; results version 6. See
[the numerical evidence](../docs/results-changes/2026-10-buckling-certificate.md).
