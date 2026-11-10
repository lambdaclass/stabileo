# Dynamics basis and reciprocity audit (#759, #760)

Starting main: `8f4c3ee6c07c661c090865f7390d10b78162786f` (2026-11-10).
Both issues and every comment were read with `gh issue view --comments`.

## Main reproductions

The #759 seed 20754, the warping cantilever and independent copies with repeated
frequencies pass the existing dense generalized-eigen reference and full seven-DOF
mass Gram checks. The previous fixes include warping in the harness, recover
independent repeated modes through mass-metric deflation and restarts, and verify
completeness with Sturm counts. See `2026-10-modal-completeness.md` in
`docs/results-changes/` for the shipped algorithm change.

The #760 seed 20843 reciprocity regression and the massless two-DOF chain's
analytic displacement and every-step reciprocal responses pass. Seed 20827 also
passes reciprocity. The reported 3D seed 20780 now refuses explicitly with
`TH-MASS-SINGULAR`: its combined mass-null direction cannot be initialized. This
refusal is recorded separately and is not a successful reciprocity comparison.
The shipped fix
starts massless rows in equilibrium. With stiffness-proportional damping their
initial velocity can jump instead of their displacement; differentiating the
massless rows supplies their rates. See published SA-2026-031. The implementation
uses symmetric stiffness, mass, Rayleigh damping and effective Newmark matrices.
These configurations are reciprocal. Gyroscopic, follower-force or other
non-symmetric operators can be physically non-reciprocal; these are not a reason
to waive reciprocity for the symmetric configurations checked here.

## Remaining guard defect

`ModalChecks` previously accepted any normalized Gram entry error below `1e-3`.
For K = M = I, (1, 0) and (1e-5, 1) are exact eigenvectors at the same eigenvalue,
yet are not an orthogonal basis. The old guard accepted them with zero eigenpair
residual. Its reported orthogonality value also covered only the latest column's
largest entry, not the whole mode set. Three near-orthogonal vectors in the new
regression have Gram Frobenius error approximately sqrt(6) times 1e-12; the old
diagnostic reported approximately 1e-12.

These are direct guard reproductions, not a reproduced public solver failure.
They are committed as ignored failing tests first and enabled with the fix.
The numerical mode shapes and time-history equations are unchanged. The modal
orthogonality diagnostic now measures the cumulative Gram error and uses its
derived threshold; future inaccurate bases can be refused earlier. PR #1890
round 1 also reproduces a false public-solver refusal introduced by the first
version of this guard. That correction is registered as
`modal-basis-entrywise-rounding`; see
[the results-change write-up](../results-changes/2026-11-modal-basis-rounding.md).
No new wrong numerical public result was reproduced; no new advisory is added.

## Acceptance bound

Let the columns of P be normalized by their computed modal masses. Require a
basis accuracy target tau equal to `LanczosParams::default().tol`, currently
1e-10. This is a basis requirement, independent of the residual test: a residual
alone cannot imply it for a repeated eigenvalue. If two unit vectors each differ
by at most tau in mass norm from orthogonal unit reference vectors, their Gram
entry error is at most b = 2 tau + tau squared by Cauchy-Schwarz. This condition
is necessary, not a certificate of eigenvector accuracy or completeness.

For each evaluated Gram entry add an arithmetic allowance

    e_ij = gamma_(n+4) sum_l |P_li (MP_j)_l|
           + (gamma_(r+1) + gamma_(n+4)) |P_i|^T |M| |P_j|,

where gamma_q = q epsilon / (1 - q epsilon), n is the solve dimension and r is
the largest mass row nonzero count. `ProductBound` supplies the row count.
The first term covers the dot product and normalization arithmetic; the second
covers the mass product and normalization of its argument. The actual absolute
mass product is evaluated in solve coordinates, on the dense or sparse mass
matrix already used for M P_j. Absolute values are taken before multiplication,
so cancellation in M P_j cannot shrink the rounding scale. The expression is
invariant under diagonal coordinate-unit changes.

The first guard version instead used the global scaled mass norm multiplied by
the modes' energy norms in the second term. That bounds the arithmetic error,
but can refuse a basis solely because an unrelated coordinate has large mass.
For K = I and M = diag(1, 1e12), the regression's exact mass-normalized coordinate
modes now pass in either order with zero Gram error and unit energy scales.
The full-spectrum solve of the symmetrized #1267 model also completes again,
restoring the harness's conditioning estimate without changing its tolerances.

Each entry must be finite with error strictly below b + e_ij. If that bound
reaches the old `1e-3` refusal threshold, refuse because independence cannot be
established at that accuracy. Thus uncertainty cannot admit a duplicate or
weaken the previous threshold. No gap-dependent exclusion is used.

For each prefix of k modes accumulate the measured Frobenius norm with one copy
of each diagonal error and two copies of each off-diagonal error. Accumulate its
bound the same way from b + e_ij. Every returned 2D or 3D mode passes this guard
in the actual solve coordinates, including constraints and warping. A failure
returns `REFUSE: self-check modal_orthogonality` and returns no mode set. Checks
use O(nk) stored vectors and O(nk squared) pairwise work, plus one absolute
mass-matrix product per mode; matrices are not densified. Published shapes retain
their existing display normalization; the Gram check uses mass-normalized vectors
internally.
