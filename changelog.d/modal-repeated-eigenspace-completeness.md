### BREAKING (results)
#### Repeated eigenvalues retain their multiplicity (2026-10-29)

Lanczos now falls back to the dense eigensolver when its single starting vector
reaches an invariant subspace before filling the requested search space. Such a
subspace can omit independent modes of a repeated frequency. Re-run modal and
dependent dynamic analyses on symmetric structures; frequencies, effective masses
and response combinations can change. The shared buckling path also falls back.
Results version 5; issue #759; PR TBD. See
[the results change](../docs/results-changes/2026-10-modal-completeness.md).

The reported warping-mode orthogonality failures were separately traced to the
nightly checker omitting the returned seventh DOF. Its reconstruction now includes
warping. MD-ORTHOGONALITY containment is untouched and must be removed when both
branches land.
