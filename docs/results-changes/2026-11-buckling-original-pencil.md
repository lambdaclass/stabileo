# Buckling factors use the original stiffness pencil

Issues #818 and #741. Results-change entry `buckling-original-pencil`. PR #1939 (partly addresses #818).

The dense buckling path forms the reciprocal problem N phi = mu K phi using a
Cholesky congruence and reports lambda = 1/mu. Rounding in that transformed
matrix can move mu enough to overestimate lambda even when the recovered mode
is accurate. On origin/main at 85c002b3a the loaded follow-up returns
1.2087954149900562, above the exact-rational bracket
[1.208795360470504, 1.208795360470958]. Main already attaches BU-ACCURACY,
refuses its certificate with computedAboveUpperBound (upper
1.2087953604980066), and withholds the certified result with BU-BOUND. The
original unloaded #741 model already refuses unresolvable roundoff compression.
This is a detected raw accuracy defect; no new advisory is assigned.

Every buckling eigensolver result now passes through one function before it can
reach any caller. For every mode, it recomputes mu = (phi^T N phi)/(phi^T K phi)
from the original CSC matrices. It scales the vector to avoid dependence on mode
normalization and accumulates both quadratic forms with compensated summation
and fused-multiply-add product remainders, including the first product's rounding
in each triple product. A zero/non-finite mode, nonpositive/non-finite stiffness
work or non-finite quotient refuses. Eigenvalues and their vectors are sorted
together after correction. Both dense and sparse paths use this function;
constraint reductions, the roundoff-compression bounding solve, 2D and 3D solvers,
JSON exports and WASM all reach it. No transformed eigenvalue is reported directly.
Modal, harmonic and nonlinear static solvers do not call this buckling path.

The loaded follow-up now returns 1.20879536047085723 for requests of one and
three modes, inside the exact bracket, and returns a certified result. The
certificate algorithm is unchanged. Its lower/upper checks still withhold any
factor outside its enclosure; no factor is clamped to a bound. The old raw factor
is deliberately injected into the real certificate using the refined mode and
still receives computedAboveUpperBound with upper 1.2087953604980066. The existing
exact-rational inertia and refusal-oracle negative assertions are retained.
BU-ACCURACY remains in place: this change corrects transformed-eigenvalue error,
without promising that every possible raw eigenvector is an exact eigenvector.

The signed reproducer commit b6f1a43e3 adds ignored tests that fail on its parent
solver before production changes: the exact loaded model fails the bracket and
K=[[s+1,s],[s,s+1]], N=I, s=1e7 returns 0.9999999997085758 instead of the exact
factor 1 at a 1e-12 assertion. The correction passes that closed form at sizes
2, 200 and 201, exercising both sides of the dense ceiling; every returned
reciprocal eigenvalue is checked against the closed-form spectrum. These are
synthetic numerical inputs, not recommended engineering parameters.

The structural family has two cantilever Euler modes with stiffness ratios
1.0000001 and 4, in both 2D and 3D. In 2D they are two independent columns; in
3D they are the two bending planes. Twelve frame elements per column resolve
the analytical factors pi^2 E I/(4 L^2 P), with E converted from the model's MPa
to kN/m^2. The first two factors must agree within relative 1e-6 through native
raw/certified/certificate and JSON APIs and actual WASM raw/certified exports.
An isolated certificate test checks the computed upper bound itself and its
adjacent representable values: at/below is accepted, above is refused.

Re-check saved buckling load factors, derived critical member forces and effective
lengths, especially coupled systems with a wide reciprocal spectrum. Mode shapes
are retained; there is no physical assembly, material, tolerance or bound change.
Validation is targeted: the exact model, closed-form pencils, Euler family,
certificate boundary/perturbation, sparse buckling tests and the existing 64-pair
generated invariant. The ignored 4096-pair nightly run is deliberately not run
under the task's no-heavy-runs constraint.


PR #1939 second review: sparse buckling now computes each locked factor from the
original pencil before boundary counting, ordering and truncation. Modal counting
keeps its existing reciprocal values. Buckling inverse matvecs and their residual
corrections use compensated products; four iterative corrections recover the
original inverse action when cancellation in Cholesky would otherwise rotate a
close mode into its neighbour. All existing residual and inertia thresholds remain.
A pencil whose inertia cannot be resolved still refuses; the s=1e11 example in
the review has this independent limitation even at the exact boundary.

The 2D solve, 3D solve and roundoff bounding solve share buckling_eigen. It carries
the original matrices and optional constraint transform into BucklingPencil.
Constraint expansion keeps both the leading sum and its product/summation
remainders, and quadratic work includes their cross terms. Compensated reduced
matrices find the modes; the reported quotient retains original-matrix work.
The constrained stiff-tie fixtures are checked against exact-rational work on
the original assembled pencil in both dimensions.

Teaching and step-document generalizedEigen also recomputes original-matrix work
with compensated sums and Dekker product remainders, then reorders the modes.
Non-finite work or non-positive stiffness refuses the teaching solve;
non-positive or unresolved geometric work excludes only that non-buckling candidate. The provenance predicate
covers members, shells, curved shells and connectors after buckling. The native
and WASM supplied-result certification APIs share the production containment path;
perturbing a factor still produces BU-BOUND and the web refuses to fall back.
The CI WASM job runs test.engine.buckling-818-wasm after building the engine.

The historical buckling_818_exact_reference remains ignored: its compression is
refused before eigensolving and belongs to #1756's roundoff-bound work. This PR
partly addresses #818 and retains its ledger warning; it does not close the issue.


Additional main evidence: running origin/main's four affected production sources
(lanczos.rs, solver/buckling.rs, certify/buckling.rs and lib.rs) on the new
buckling-818-constrained.json fixtures returns 47.579661853206964 in both dimensions.
The original assembled constrained pencil's exact-rational work is
47.57901233095258. The 2D output has only info diagnostics, and its public
certificate returns Certified with computed 47.579661853206964, lower
47.53208219135376 and upper 47.59431026276751. The 3D output carries BU-ACCURACY.
The silent 2D result is recorded for the coordinator's advisory decision; no
advisory or number is assigned here. The corrected factors in both dimensions
are 47.57901233095258. Disabling refinement locally restores the wrong factor
and fails the structural regression by more than relative 1e-6.

PR #1939 third review: original constrained factors must be compared with counts
from the same original constrained pencil. The previous branch counted the
rounded reduced K and N spectra. Padding the stiff-tie fixtures with 99 uncoupled
columns gives 201 independent degrees of freedom. The original factor remains
47.57901233095258; the rounded reduced factor is 47.579661853206964. On the previous
branch both padded fixtures refuse completeness, even though the mode is recovered.

Sparse selection now takes a BucklingPencil context for both factors and inertia,
rather than a factor-only callback. It accumulates each entry of C^T(K-sigma N)C
from original matrix entries, retaining multiplication and summation remainders
through the shift and congruence before rounding the completed entry. It does not
subtract two already rounded reduced matrices. The positive-spectrum upper bound
also uses compensated original geometric work. The original LDL inertia guard
and its shift margins remain unchanged; unresolved inertia still refuses. Modal
selection retains its existing matrices and reciprocal-factor behavior.

A borrowed CSR transform view removes the linalg dependency on solver constraint
types. The existing Kani dependency-closure assertion now passes without expanding
its input list or weakening the assertion. The two supplied-result certification
exports are registered with the existing invariance tracking issue #1497.

The new minimal constrained family covers 200, 201 and 202 independent degrees of
freedom, both signs of the tie perturbation, both dimension contexts and requests
for one or two modes. Both padded structural fixtures exercise native raw,
certified, certificate-only and supplied-result APIs, JSON wrappers and actual
WASM exports. Shift tests compare the congruence with exact-rational arithmetic,
check inertia on both sides of the critical factor, and retain singular refusal.
The unmodified legacy-project judge must still reject a wrong linear truss member
force. Unknown and partially recorded analysis histories remain eligible through the shared
`analysis:buckling` fallback. A stamp that explicitly records a linear-only or
modal-only history is excluded. The registry declares no linear-static quantity
changes, so its notice cannot explain a changed member force, reaction,
displacement or solve status in the legacy-project judge.

PR #1939 fourth review: corrected Rayleigh work alone cannot repair a mode rotated
by cancellation in an uncompensated constraint reduction. The solver now has one
`BucklingSolve` constructor, owned by `BucklingPencil`. It derives both reduced
matrices with compensated original congruence. Its private reduced matrices feed
Cholesky, Jacobi, Lanczos and residual checks; factor refinement and shifted
inertia use the same original pencil. Callers cannot pair a pencil with arbitrary
reduced eigensolver matrices. The shared path also handles roundoff bounding solves.

The coupled constrained structural fixtures have two transverse directions.
Their first two factors, independently calculated from exact-rational bilinear
work on the assembled matrices and an analytic two-by-two eigenproblem, are
21.52873226079837 and 41.80506272171481. The previous branch returns
21.528732261250827 for the first factor in the dense 2D case, an overestimate that
still receives a Certified status. Dense and padded sparse 2D and 3D cases now
agree with both reference factors to the unchanged relative 1e-12 assertion.
Minimal matrix tests cover one, two, 200, 201 and 202 independent coordinates,
both signs of the constraint perturbation, and positive stiffness erased by the
old reduction. Native and actual WASM raw, certified and supplied-result paths
exercise the structural cases.

Sparse candidate locking distinguishes non-buckling directions from invalid
work. A zero/tension candidate is deflated without discarding compressed modes;
accepted factors keep an explicit index into the locked vectors. Only finite positive original work enters the returned buckling spectrum.
The native positive-mode resolution, inertia shifts, residual thresholds and
certificate tolerances are unchanged.

The teaching generalized eigenproblem accepts the original free-DOF matrices
and optional axial-rigidity transform together. It performs compensated
congruence internally and retains both expansion terms when evaluating original
work. Linear buckling and step derivations use this same path. A spurious
positive Ritz value from a zero/tension direction no longer discards all valid
compressed modes. Non-finite work and non-positive stiffness still refuse.

3D result certification expands curved beams before constructing the system,
constraint map and inclined DOFs. A rigid link to an interior arc node with a
spring at its slave previously produced a false BU-BOUND refusal against a
system that certifies when explicitly expanded. Solver-driven, certificate-only,
supplied-result, JSON and WASM paths now use identical coordinates and certify.

The structural native and WASM checks now require Certified status, including
the constrained sparse cases. The shell reference is 0.27449776038400286 from
exact-rational original work; the WASM test asserts it instead of skipping the
factor. Two-mode sparse requests check the second factor against an isolated
column as well as checking the first one.

The branch also changes previously recorded unconstrained buckling factors.
The 3D sparse-mass parity golden represented the old reciprocal eigenvalue;
its replacement is independently checked by exact-rational original work on each
returned mode, retaining the 1e-10 golden assertion and adding a 1e-12 work check.
The curvature-patterned-arch evidence is regenerated for the corrected engine
factors, with every reference, validation tolerance and passed assertion retained.
No advisory is added or numbered. The previously recorded silent origin/main
2D error remains for the coordinator's advisory decision.
