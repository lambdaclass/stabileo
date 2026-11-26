### BREAKING (results)

#### Compute quad self-weight from local edge differences

Quad self-weight uses local edge differences and checks each corner with a rounding bound derived from its quadrature sum. The CAD arch example passes load accounting, and discrepancies beyond the bound still stop the solve. See the [results change](../docs/results-changes/2026-11-quad-self-weight-roundoff.md#compute-quad-self-weight-from-local-edge-differences). (#2586)
