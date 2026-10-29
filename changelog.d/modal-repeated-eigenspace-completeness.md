### BREAKING (results)
#### Repeated eigenvalues retain their multiplicity (2026-10-29)

Lanczos now verifies completeness with a sparse Sturm (Sylvester inertia) count
of K − σM just above the requested eigenvalue boundary. Missing directions are
recovered with independent random starts and mass-orthogonal deflation, including
the full multiplicity of boundary clusters. There is no sparse-path DOF cap.
Failure to establish completeness within the iteration limit returns an explicit
refusal. Re-run modal and dependent dynamic analyses; frequencies, effective
masses and response combinations can change. The shared buckling path also checks
completeness in its positive stiffness metric.
Exactly massless DOFs are statically condensed before dense modal fallback, so
a near-zero mode cannot make the reciprocal cutoff discard higher physical modes.
Results version 5; issue #759; PR #827. See
[the results change](../docs/results-changes/2026-10-modal-completeness.md).

The reported warping-mode orthogonality failures were separately traced to the
nightly checker omitting the returned seventh DOF. Its reconstruction now includes
warping. MD-ORTHOGONALITY containment is untouched and must be removed when both
branches land.
