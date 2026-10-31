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

A is self-adjoint in the M inner product: ⟨φⱼ, Av⟩_M = φⱼᵀMK⁻¹Mv =
⟨Aφⱼ, v⟩_M = μⱼ⟨φⱼ, v⟩_M = 0. With μ real, ⟨φⱼ, Av − μv⟩_M = 0 too, so the exact
residual has no component along any locked eigenvector. Any component the
computed residual carries there is the rounding of the K⁻¹ solve, which is of
order ε·μ₁ in the locked direction of the largest μ, not of order ε·μ. The
operator residual is therefore now computed after projecting Av − μv against the
locked eigenvectors with the same twice-applied M-orthogonal projection used for
the Lanczos basis. The projection only removes components the exact residual
does not have; it cannot hide an error in μ or in v's unlocked components,
because those lie in the M-orthogonal complement it leaves untouched. A wrong
eigenvalue μ(1+δ) still leaves a residual of |δ|μ along v itself, which is
M-orthogonal to the locked vectors; the regression perturbs μ by ±1e-7, 1e-6
and 1e-3 on a 201-coordinate chain with three locked modes and requires each
to fail the unchanged 1e-8·μ bound, with the residual equal to |δ|μ to 1%. The
pencil backward-error check is unchanged and is computed on the unprojected
equation, so the projection does not weaken it.

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

Review-fix validation uses only targeted tests, with CARGO_BUILD_JOBS=2 and
CARGO_TARGET_DIR=/private/tmp/claude-501/codex-827fix3-target:

- Engine `cargo test --locked --lib lanczos`: 27 passed.
- Engine `cargo test --locked --lib modal`: 6 passed.
- Engine `cargo test --locked --test core modal`: 31 passed.
- Web touched Vitest files: finite-spectrum-warning and report-says-what-ran,
  17 tests passed.
- TypeScript: 0 new errors against the unchanged 247-error baseline.
- Guarded Svelte check and shared site-header check passed.

RecheckNotice.svelte and registry loading are unchanged: PR #814 owns the
readability, action targets and lazy-loading work. This review fix does not claim
to resolve those findings or validate their route-byte budgets. No Playwright or
full test suites were run for this follow-up.
