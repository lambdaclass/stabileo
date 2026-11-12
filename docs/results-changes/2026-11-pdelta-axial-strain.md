# P-Delta retains axial strain through cancellation (2026-11-12)

PR #1940 follow-up. The quick-tier rigid control derived from
`fuzz_rich_2d/20772` removes the conflicting `kx` on the guided support.
With quick seed `20754`, its representable quarter-turn copy could oscillate
between P-Delta iterates instead of meeting the requested tolerance. The unit
comparisons at seeds `20754` and `20261105` already completed correctly; changing
those expectations alone would have hidden the separate rotation regression.

The member axial force used to subtract two separately rounded local endpoint
projections, then divide and subtract thermal strain. Those operations lose the
small axial strain beside larger translations. Frame and truss assembly and
geometric end-force recovery now call one compensated calculation of all
endpoint contributions and thermal strain, in both dimensions and both matrix
storage paths. An explicit geometric state selects compensated equilibrium evaluation for
P-Delta and the existing linearized projection for buckling. Buckling's
compression-noise bounds and eigenvalue certification are calibrated to that
linearization; its numerical model, pinned #741 factor and certificate refusal
are retained. Changing buckling stress arithmetic requires revalidating those
bounds together and is outside this correction. The convergence metric,
iteration budget and tolerances are unchanged. Linear stiffness and its acceptance criteria are unchanged.

The exact quarter-turn witness is an active regression. Independent cantilever
references solve the cubic-Hermite P-Delta free block directly and the
corotational cantilever equilibrium by a scalar bracketed solve. References
are derived from the element equations, without calling production stiffness,
transformation, geometric-force or nonlinear-iteration kernels. Unit changes,
reflection, 2D, all three spatial planes, native exports and actual WASM are
covered. Exact-rational product checks exercise cancellation, zero strain,
tension, compression and thermal strain. Supported-load controls verify the
zero-strain response and reaction; deliberately wrong responses must fail.

The previously corrected minimal/generated corotational #761, supported mirror
#1100 and P-Delta units #971 reproducers are active. Generated rotation/mirror
cells can no longer be suppressed by the old #761 coverage mask. Passing means
numerical values were compared, with refusals and lost coverage rejected.
The rolled 3D #971 rotation cell also satisfies an independent quaternion
reconstruction of member constitutive forces and equilibrium; its remaining
quick-tier expected-failure entry is removed.

Re-check member P-Delta analyses where small axial strains are
recovered beside larger endpoint translations or thermal strains. Iteration
counts, convergence, displacements, geometric forces and stability calculations
can change. No new advisory is assigned by this change.
