### BREAKING (results)

#### Buckling factors use the original stiffness pencil (#818, 2026-11-11)

Recompute every dense and sparse buckling eigenvalue from its mode's compensated Rayleigh quotient on the original stiffness and geometric-stiffness matrices. The shared path covers 2D, 3D, raw, certified and WASM calls. The loaded #741/#818 follow-up now returns 1.20879536047085723 inside its independently checked exact-rational bracket and certifies; its previous 1.2087954149900562 overestimate is still refused when deliberately supplied to the certificate. Certificate bounds and refusal thresholds are unchanged. See [the results-change evidence](../docs/results-changes/2026-11-buckling-original-pencil.md).
