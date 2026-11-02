# Preserve repeated modes and certify finite-spectrum exhaustion

Results version: 6 (main was 5 after #814). Issue: #759. PR: #827.

A single Lanczos starting vector can recover only one direction of an exact
repeated eigenspace. Early breakdown and small Ritz residuals therefore do not
prove that the lowest modes were found with their multiplicity. This change
uses sparse Sturm counts, deflated deterministic random restarts and explicit
refusal when convergence or completeness cannot be established. Early breakdown
does **not** trigger a dense fallback for large models.

The sparse path factors K − σM with LDLᵀ and counts negative pivots, with σ just
above the highest requested eigenvalue. If independent converged directions do
not account for that count, it locks those directions and restarts. Basis vectors
are twice orthogonalized against locked vectors in the mass metric. The full
boundary cluster is recovered internally before returning the requested number
of ascending, mass-normalized modes. Buckling uses the positive stiffness metric
and counts positive critical load factors. Sparse storage follows factorization
fill and locked vectors; there is no DOF cap or large-model dense fallback.

The LDLᵀ factorization refuses zero, nonfinite or numerically unreliable pivots
without perturbing the matrix. Nearby shifts use the existing relative margins
1e-7, 3e-7 and 1e-6. An uncertifiable short spectrum or exhausted iteration budget
returns the existing eigenvalue-failure diagnostic, never an incomplete success.
For the sparse short-spectrum check, positive mass/geometric inertia bounds the
number of modes; when unavailable, active coordinates give a conservative bound.

Small problems retain their dense path, including small noninvertible stiffness
problems used to detect mechanisms. Dense finite-spectrum exhaustion now has an
independent total count. Symmetric mass elimination separates massive and exactly
massless coordinates, including null directions that are not zero rows. Positive
mass coordinates are equilibrated, massless stiffness coordinates are statically
condensed, and their displacements are recovered afterward. The finite pencil
is whitened to Cx = λx. A Sturm count at a shift above twice max(1, ‖C‖∞) must
account for every finite coordinate. This bound depends on the matrix, not the
largest retained eigenvalue. No reciprocal cutoff, artificial mass, or relaxed
factorization or convergence tolerance is used to discard high finite modes.

The dense regression K = I₃,
M = [[1,1,0],[1,1,0],[0,0,1e-14]] requests three modes through both public entry
points. Both must recover 0.5 and 1e14, with unit modal mass and the original
eigen-equation satisfied. The former check accepted only 0.5 because it counted
below the largest retained eigenvalue. Existing zero-row condensation,
non-diagonal singular mass, repeated-mode, near-zero refusal and sparse-scale
regressions remain in place. Finite modes below the existing positive-frequency
threshold still cause an explicit refusal.

When fewer finite modes exist than requested, both workspace result paths and
the PRO modal panel now show “Only N finite modes exist. Massless directions have
no finite frequency.” The message is translated into English, Spanish,
Portuguese, German, French and Turkish. Toolbar notifications use an informative
message instead of an unqualified success, and modal reports carry the same
explanation. The web regression solves a cantilever with translational tip mass
and massless rotations, then renders its result through both workspace toolbar
paths in all six languages. A separate report regression checks the explanation.

In the original sixteen-cantilever fixture, the second squared angular frequency
changes from 38,156,001.48918348 to 27,685,104.630653664 rad²/s², restoring the
repeated lowest eigenvalue (983.1087470294 → 837.4197827911 Hz). Effective masses
and downstream spectral, harmonic and time-history results can change; symmetric
structures should be re-analyzed. The warping orthogonality checker also now
includes all seven returned DOFs. That checker correction alone does not change
solver results. Published shape normalization and the certificate proof contract
remain unchanged: duplicated or missing vectors cannot establish completeness.

## Locking near a near-mechanism

Each converged Ritz pair (μ, v) of the zero-shift operator A = K⁻¹M is locked
only if it passes two checks: the operator residual ‖Av − μv‖_M ≤ 1e-8·μ and
the pencil backward error ‖μKv − Mv‖∞ ≤ 1e-10·(μ‖K‖∞ + ‖M‖∞)‖v‖∞. Before
both, v is M-orthogonally projected against the already locked, M-normalized
eigenvectors φⱼ, so ⟨φⱼ, v⟩_M = 0.

A is self-adjoint in the M inner product, so for an exact locked eigenvector
⟨φⱼ, Av − μv⟩_M = 0: the residual's component along it is only the rounding of
the K⁻¹ solve, of order ε·μ₁ in the direction of the largest μ, not ε·μ. The
locked vectors are not exact, though, and the component is then the coupling
cⱼ = rⱼᵀMv to the locked pair's own residual. The acceptance residual is
therefore the projected residual plus a bound on these couplings (next section
but one): first order for locked values near μ, second order across a gap.
A wrong eigenvalue μ(1+δ) still leaves a residual of |δ|μ along v itself; the
regression perturbs μ by ±1e-7, 1e-6 and 1e-3 on a 201-coordinate chain with
three locked modes and requires each to fail the 1e-8·μ bound, with the
residual equal to |δ|μ to 1%. The pencil backward-error check is computed on
the unprojected equation.

The stock 8×8 simply supported MITC4 plate shows why this matters. Its in-plane
rotation about the pinned corner is held only by drilling stiffness
(λ₁ ≈ 4.28e-9, μ₁ ≈ 2.3e8). Without the projection, K⁻¹ rounding along that
direction gave the tenth mode (λ = 92,878.47) an operator residual of 3.3e-8
against a bound of 1.1e-13, although its pencil backward error was about 4e-16.
The mode never locked, the Sturm count exceeded the locked count, and the solver
refused 10 or more modes after all 300 restarts. Harmonic analysis then repeated
the same algorithm through its dense entry point and fell back to the direct
solve. With the projection both 10 and 50 modes certify in the first round;
the new gate checks every mode's pencil backward error (worst 9e-15), mass
orthonormality (worst 9e-16), the Sturm count below and through the boundary,
and that the harmonic gate on this plate runs `modal+static`. Its amplitudes
match the direct solve to 3.4e-6 relative (1.2e-9 of the peak); its time went
from 59 s to 1 s.

The restart loop also refuses after five consecutive rounds that lock nothing,
instead of spending the full 300-round budget when no new direction can pass
both checks. A round that locks nothing leaves the Sturm comparison unchanged,
so only further locking can certify. In the existing suites the one model that
reaches five such rounds, a 98-DOF fuzz model asked for four 3D modes in the
determinism test, was already refused: it stalled from round 36 to the 300-round
limit before, and is now refused at round 22 with 66 directions locked.
Replaying every engine test's old eigensolver path with both checks evaluated
found the projection changing a lock decision only on this plate (the gate and
the harmonic test) and on that refused fuzz model; every other eigensolve locks
the same vectors in the same order, so its results are bit-identical.

The acceptance residual is measured against the original operator, with the
part removed by projection bounded rather than dropped. Projecting removes,
along each locked vector v_i, the coupling c_i = (M v_i)ᵀ(Opv − μv). Op = K⁻¹M
is self-adjoint in the M inner product and v is M-orthogonal to v_i, so
c_i = r_iᵀ M v, where r_i = Op v_i − μ_i v_i is the locked pair's own residual;
with inexact locked vectors it is not zero. Acceptance requires
‖projected residual‖ + min over splits of the locked set into near (N) and far
(F) values of ‖c_N‖ + ‖c_F‖²/(η_F − ‖c_F‖) ≤ 10⁻⁸·μ, where η_F is the smallest
|μ_i − μ| in F (and must exceed 2‖c_F‖): a coupling to a nearby locked value,
as in a repeated cluster, counts at first order; a coupling across a gap
counts by the quadratic residual bound. Couplings to a near-mechanism mode,
whose K⁻¹ rounding exceeded 10⁻⁸·μ when counted at first order, are divided by
their very large gap. `coupling_removed_by_an_inexact_locked_vector_counts_against_acceptance`
checks the bound term by term and that a coupling above the tolerance is
rejected; `projected_residual_with_inexact_locked_vectors_on_a_scaled_pencil_still_rejects_wrong_pairs`
locks a near-mechanism mode (μ = 10⁶) and two frame modes, each carrying 10⁻⁹
of the candidate, on a pencil scaled by 10⁻³…10³, and checks that the accepted
pair's Rayleigh quotient is within 10⁻⁸ of the exact eigenvalue and that
eigenvalue errors of ±10⁻⁷ and an eigenvector carrying 10⁻⁵ of another mode are
rejected. The pencil backward-error check on the original K and M and the Sturm
count at the boundary (no eigenvalue below it skipped) remain as separate checks.

A negative mass pivot in the dense semidefinite path still refuses the model,
even at rounding level: a mass that is semidefinite but loses a pivot to
cancellation cannot be told apart from a slightly indefinite one, and treating
the pivot as massless would discard a finite eigenvalue of the original pencil.

Verification of the final head is in the PR.
