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
