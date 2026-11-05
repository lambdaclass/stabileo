### BREAKING (results)

#### Safety containment diagnostics (2026-10-29)

- Register safety containment diagnostics (#807, #447): known-issue warnings added; numerical values of retained results are unchanged except the 2D reactions corrected for #1113. Unsafe affected results are withheld with structured refusals. See [Safety containment diagnostics](docs/results-changes/2026-10-containment.md).
- Preserve warnings across influence and moving-load sweeps and standalone spectral certification; warn on all 3D buckling factors pending #818. Run the read-only containment audit as an advisory check. Numerical values are unchanged.
- Preserve the model viewport during containment, retire failed advanced reruns, and carry localized refusals and warnings through tables and exports. Warn on MITC4 shell convergence uncertainty (#810); non-static rotated-shell operations remain available.
- Correct 2D reactions of a settled rigid support that also carries a spring on the settled DOF (#1113): the spring force −k·u is now included, so the reactions balance the loads. Fiber analyses now warn on near-singular tangents like the other nonlinear solvers (#1093).
- Warn on CIRSOC 201 column and biaxial checks whose axial force and moment come from different combinations (#1316): the check names both combinations and a passing member becomes a warning. Ratios are unchanged.
- Refuse 3D buckling, Guyan and Craig–Bampton reductions of models with distorted MITC4 elements, as 3D harmonic analysis already does (#798): their mode shapes and reduced matrices carry the locked membrane stiffness that the static field check cannot see.
- Warn on 2D and 3D P-Delta when members carry axial span loads (#1329): the geometric stiffness uses each member's mean axial force, which can understate the second-order amplification. Values are unchanged.
