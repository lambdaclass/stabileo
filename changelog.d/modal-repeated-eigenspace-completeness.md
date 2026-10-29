### BREAKING (results)
#### Repeated eigenvalues retain their multiplicity (2026-10-29)

Lanczos now requires convergence in a full-dimensional search space before
accepting results, otherwise using the dense eigensolver. A smaller search space
can omit independent modes of a repeated frequency even with small residuals.
Re-run modal and dependent dynamic analyses; frequencies, effective masses and
response combinations can change. The shared buckling path is also affected.
These eigensolvers now refuse more than 2,048 free DOFs before allocating dense
or search-space matrices; reduce the mesh or model size. This conservative limit
also affects large models with simple spectra that previously solved sparsely.
Exactly massless DOFs are statically condensed before dense modal fallback, so
a near-zero mode cannot make the reciprocal cutoff discard higher physical modes.
Results version 5; issue #759; PR #827. See
[the results change](../docs/results-changes/2026-10-modal-completeness.md).

The reported warping-mode orthogonality failures were separately traced to the
nightly checker omitting the returned seventh DOF. Its reconstruction now includes
warping. MD-ORTHOGONALITY containment is untouched and must be removed when both
branches land.
