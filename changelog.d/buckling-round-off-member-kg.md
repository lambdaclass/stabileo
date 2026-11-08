### BREAKING (results)
#### Buckling no longer takes geometric stiffness from round-off axial forces (2026-11-08)

2D and 3D buckling built geometric stiffness from every member's axial force, including members whose force is only round-off, and could return an extra mode with λ ≈ 1e10 depending on the orientation, units and load scale (#982). Those members now contribute no geometric stiffness, the round-off bound no longer has an absolute 1e-6 kN floor, so it does not depend on units, and a 1/λ below 100 ε of the largest is dropped as eigensolver round-off. Physical factors change only at round-off level; spurious modes disappear. Details: [docs/results-changes/2026-11-buckling-round-off-member-kg.md](../docs/results-changes/2026-11-buckling-round-off-member-kg.md).
