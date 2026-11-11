# Buckling factors use the original stiffness pencil

Issues #818 and #741. Results-change entry `buckling-original-pencil`. No PR assigned.

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
