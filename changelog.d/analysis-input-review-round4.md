### BREAKING (results)

#### Validate fixed-size solver input and authored restraints

WASM object analysis refuses extra entries in fixed-size sequences, and model validation refuses misspelled support keys before applying restraint defaults. Saved-result recheck flags malformed structural collections and planar nodal moment fields. It uses the saved project plane for older solve stamps and checks all supported planes when the saved plane is unknown. [Structural results change](../docs/results-changes/2026-11-malformed-structural-input.md) · [Load results change](../docs/results-changes/2026-11-authored-load-validation.md)

#### Solve overflowing single-DOF planar constraints

Planar analysis uses a unit coefficient when an overflowing homogeneous constraint reduces to a single degree of freedom. [Planar MPC results change](../docs/results-changes/2026-11-malformed-structural-input.md#planar-projection-of-multipoint-constraints)
