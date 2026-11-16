# P-Delta and SSI retain equilibrium through cancellation (2026-11-11)

PR #1940, issue #761. Strict equilibrium checks exposed roundoff in the
matrix-vector products used to decide convergence. The self-weighted MITC4
strip in the metamorphic corpus converged with its original numbering but
failed after relabeling at the same requested tolerance. Subdivided SSI frames
with inclined supports and constraints also stopped above their requested
residual limit after the soil secants stopped changing.

Dense and sparse residual evaluation now share compensated product accumulation
with the linear solver's existing accuracy checks. SSI retains the accumulator
through addition of the soil and applied forces, rather than rounding the
structural product and then adding a pre-subtracted soil-minus-load term. A
point spring with a structural force and applied force of 1e16 and a soil force
of 1 previously lost the soil term and claimed convergence at 1e-20 despite
an independently visible relative residual of 1e-16. The new strict case refuses
convergence; the same model converges at 1e-15, and the no-soil controls retain
their exact answer. These are algebraic test scales, not material reference data.
Products retain their FMA
remainders and additions retain their low terms. P-Delta uses the same full
residual path for its prescribed-motion right-hand side, convergence check and
restrained reactions. P-Delta and SSI Cholesky solves make at most two residual
corrections with the existing factor. A correction is retained only when its
compensated residual norm decreases. The original physical convergence metric,
requested tolerances and iteration budgets still decide acceptance. This can
change convergence status, iteration counts, displacements, forces and reactions.

SSI now has one secant-system builder and one solve dispatcher for both spatial
dimensions and both storage paths. Structural stiffness is reduced through the
constraints before it is combined with separately reduced soil stiffness. Adding
soil to a large structural diagonal before reduction rounded the soil contribution
even when the structural contribution canceled exactly under a rigid constraint.
The separate reduction preserves the stiffness of soil supporting a rigid pile.
Sparse systems remain sparse; the storage threshold and LU fallback policy are
unchanged.

The axial pile hand calculation assumes uniform shaft and tip settlement. Its
positive fixture now imposes that assumption with equal vertical displacements,
retaining the original geometry, material, soil curves, load, iteration budget,
convergence tolerance and every settlement and capacity bound. The original
finite-stiffness fixture remains as a negative convergence control with those
same hand checks. On the parent source its stiffness change was zero while an
independent 80-digit calculation gave a relative force residual of approximately
5.95235075844116e-8 against a requested 1e-12. Its old unconditional convergence
expectation was therefore incorrect. The finite-stiffness fixture must still
report nonconvergence, and a separate element axial-force calculation verifies
that its returned state exceeds the requested residual limit.

Coverage includes the original shell-strip relabeling, constrained inclined SSI
frames, rigid and finite-stiffness axial piles, balanced and unbalanced residuals
under cancellation, zero and insufficient iteration budgets, 2D and 3D native
entry points and actual WASM exports. Existing hand-calculation and balance
assertions and tolerances are retained. Re-run affected P-Delta and SSI analyses.
No new main or released silent wrong-result claim or advisory number is assigned
by this follow-up.
