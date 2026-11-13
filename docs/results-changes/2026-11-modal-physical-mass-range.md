# Modal analysis preserves the physical mass range

Issue #1965. Results-change entry `modal-physical-mass-range`.

The issue's physical free mass has rank two. After support rotations and an MPC,
forming the dense reduced mass matrix introduces a tiny positive third direction.
The previous semidefinite eigensolver treated that rounded direction as physical
inertia. Its third candidate then correctly failed the unchanged modal basis
check, withholding the two valid finite modes as well. On origin/main
72224c0062e58746271da34277572e103bccc382 the rotated witness refuses with
`modal_orthogonality: rounding bound cannot establish an independent modal basis`.
This witness establishes a detected availability defect, not a silent published
wrong result. No advisory is assigned here.

Assembly now retains massive rows before geometric/support rotations and MPC
congruences. Element masses are factored on their massive local coordinates,
with diagonal equilibration before the existing Cholesky check. Curved-shell
rotary inertia uses its quadrature displacement rows, including each director's
massless spin. The same quadrature geometry supplies the existing matrix
assembler. Nodal masses contribute individual weighted coordinate rows.
`MassAssembly` carries these blocks; support rotations and MPCs act on their
covectors in exact rational arithmetic over the supplied finite coefficients.
An exact row reduction determines rank without comparing inertia with a numeric
cutoff. The weights give M = W^T W; rank comes from the physical rows, never from
pivots of the rounded reduced mass matrix.

`MassRange` is the shared `physical_mass_range` guard. For a rank-deficient physical mass it constructs a congruence separating its
nullspace from the massive coordinates. It forms mass only on the latter. Sparse Cholesky
solves K_ss x_s = -K_sm x_m, forms the Schur stiffness, and recovers the massless
coordinates after solving the finite pencil. Every result must contain exactly
min(requested, physical rank) candidates. No additional mass coordinate can enter
the finite eigenproblem. Unresolvable source factors, non-finite transforms,
zero available mass and failed condensation refuse. Full-rank ranges retain the original solve arithmetic, with the same
candidate-count guard. Every rank-deficient range is condensed, including
coordinate-aligned nullspaces.

Both dense 2D and sparse 2D/3D modal callers, their replacement-mode solves,
certified wrappers, JSON and actual WASM exports use this type. Conditioning
observers receive the factor of the original solve stiffness, with its original
dimension; the condensed factor is confined to the finite pencil. Consumers of these modal results inherit their corrected mode counts. There
is no separate nonlinear-tangent modal API. Harmonic response, transient damping
frequency estimation and component reduction have separate matrix-only internal
eigenproblems; those are outside the public modal analysis entry points changed here. Independent low-level generalized
eigenvalue utilities retain their matrix-only contract. Modal equation,
orthogonality, certification and Sturm bounds are unchanged.

The original and rotated physical eigenvalues were independently computed with
mpmath 1.3.0 at 60 and 100 decimal digits during investigation. Both precisions
agree to the following printed digits:

- Original: 229973.5106775624807203244627724831574865 and
  6243695.142236023281772709849489862244977.
- Rotated: 229973.5106775600935160982784968364555173 and
  6243695.142236013914171040611438743782218.

The active regression requires exactly two modes, the existing conditioning
comparison and certified enclosures containing these references. It also checks
representable quarter turns. Synthetic spring/MPC families have independent
closed-form eigenvalues 1 + 1/||a||^2, including repeated and clustered copies.
Coverage includes rank one/two, unconstrained controls, inclined supports,
dense/sparse assembly and the 80/81 finite-rank eigensolver boundary, zero versus tiny positive
inertia, 3D dimensional scaling and the typed units input boundary. Native and
WASM raw/certified calls exercise the same family cases. Full-rank 2D/3D
cantilevers retain every numeric result bit of the captured main WASM reference;
the native checks compare f64 bits as well. Dependent bases still refuse while
independent repeated bases pass.

Signed reproducer commit e32092487 adds ignored tests before the implementation.
All four issue tests fail against its unchanged parent solver; the exact rotated
WASM witness also refuses on that parent. The implementation removes their
ignores. Test logs, high-precision reference scripts and the main WASM binary
are retained as untracked worktree evidence, with commands and outcomes in the
handoff. Re-check saved modal frequencies, mode counts, shapes and participation,
and dependent spectral/harmonic/transient responses for affected singular-mass
models. This change does not claim to resolve other documented dynamic-model
limitations.

Review #2007 narrows the saved-project notice to modal or spectral analyses
with constraints or inclined supports. The feature predicate conservatively
identifies transformations that can expose rank-deficient mass; the snapshot
reader does not repeat the engine's exact physical-rank calculation. Ordinary
projects without either transformation are excluded, including the unchanged
empty-model exact-list regression. Native and WASM negative cases now also
cover positive physical mass alongside a singular or indefinite massless
stiffness block, with positive-stiffness controls that retain their finite mode.
The public WASM regression target runs in the required WASM CI job and exports
the native family inputs before replaying them through both WASM entry points.
No engine result or numerical bound changes in this review follow-up.
