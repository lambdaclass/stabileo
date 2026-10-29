# Repeated eigenvalues retain their multiplicity

Results version: 5 (main was 4). Issue: #759. PR: #827.

A single starting vector for Lanczos spans at most one direction of each exact
repeated eigenspace. Neither early breakdown nor small Ritz residuals after a
full requested search space prove that all lowest eigenvalues were found with
multiplicity. The solver now factors K − σM with sparse LDLᵀ and counts negative
pivots (Sylvester inertia), with σ just above the highest requested eigenvalue.
If that count exceeds the independent converged directions below σ, it locks
those directions and restarts with a new deterministic random seed. Every basis
vector is twice orthogonalized against the locked vectors in the mass metric.
The full boundary cluster is recovered internally before returning the requested
number of mass-normalized, ascending modes. Buckling uses the positive stiffness
metric and the same count of positive critical load factors.

The sparse LDLᵀ implementation reuses the Cholesky symbolic fill structure;
storage is proportional to sparse fill, not n². It refuses zero, nonfinite or
numerically unreliable pivots without perturbation. The solver retries nearby
shifts (relative margins 1e-7, 3e-7 and 1e-6). Convergence or completeness failure
at the iteration limit returns an actionable refusal, never partial results.
There is no DOF cap on the Lanczos path and no dense fallback for large models.
Dense Jacobi remains for small models, including noninvertible stiffness used
to detect mechanisms, and requests for half the spectrum up to 200 DOFs. Random seeds are projected through K⁻¹M
before iteration to recover statically admissible massless coordinates.

The completeness check also exposes a dense-fallback defect for exactly massless
DOFs: a near-zero mode can make the relative reciprocal-eigenvalue cutoff
classify higher physical modes as infinite. The fallback now statically condenses
exactly zero mass rows, solves the finite-mass problem, and recovers the eliminated
coordinates. No artificial mass or numerical cutoff is introduced. A diagonal
regression with eigenvalues 1e-10 and repeated 1e4 plus a massless DOF pins the
lost modes; a coupled three-DOF regression checks the recovered coordinates,
unit modal mass, and the original eigen-equation.

In the regression of sixteen identical one-member warping cantilevers, the second
returned squared angular frequency changes from 38,156,001.48918348 to
27,685,104.630653664 rad²/s², the repeated lowest eigenvalue (frequency
983.1087470294 → 837.4197827911 Hz). Modal effective masses
and downstream spectral, harmonic and time-history results may also change.
Re-run these analyses on symmetric structures.

The two orthogonality reports in the issue have a separate cause: the metamorphic
checker reconstructed six DOFs per node and omitted the returned warping DOF.
The feature-matrix cantilever then appeared to have a mass cross product of
0.01685, and seed 20754 appeared to duplicate a mode. With all seven DOFs these
models already pass the mass-orthogonality and dense-spectrum checks on main.
The checker now includes warping; this correction alone changes no solver results.

Regression tests check mass-normalized Gram matrices (including repeated pairs),
ascending frequencies and dense-reference spectra with multiplicity. Generated
symmetric structures vary length, copy count, warping and requested mode count.
The existing published max-component shape normalization is preserved.

The certificate algorithm and its proof contract are unchanged. Independent
repeated modes can certify completeness; duplicated or missing vectors cannot.
Single-mode enclosures alone do not establish completeness. Tests exercise these
cases and compare certificate claims with the dense reference spectrum.

MD-ORTHOGONALITY containment belongs to another branch and is not changed here.
It must be removed when both branches land.

Verification for the replacement implementation uses
`CARGO_TARGET_DIR=/private/tmp/claude-501/codex-827-target` and the Nix toolchain.
The tests retain independent dense-spectrum, mass-Gram, sorting and certificate
checks, including rejection of missing or duplicated vectors. They cover the
issue fixtures, generated symmetric cantilevers, 40/60 eigenvalues repeated three
times, a boundary cluster cut by the requested count, an explicit restart-limit
refusal, exact massless condensation and a 20,000-DOF sparse regression.
Sparse inertia is compared with dense eigenvalue counts, known congruences
with repeated signs at scales 1e-12 to 1e12, and invalid pivots. The large-building web test again expects successful buckling analysis.

Performance fixture: `engine/examples/modal_20000.rs`, a 20,000-DOF symmetric
tridiagonal stiffness with graded diagonal, identity mass, and six requested
modes. Build in release mode, then measure the executable alone; peak RSS comes
from `getrusage(RUSAGE_CHILDREN)` on macOS. The baseline was built before changing
the reverted Lanczos implementation (only the missing error-message function
was restored so the working tree could compile). No commits, pushes or git metadata changes were made; the required build/gate
scripts perform their existing read-only provenance checks.

Final validation and benchmark results are recorded below after completion.
