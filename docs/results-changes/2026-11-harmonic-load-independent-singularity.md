# Load-independent numerical singularity refusal for harmonic direct solves (2026-11-10)

PR #1922. The existing `harmonic-omitted-modes` registry entry covers this final
follow-up within the same unmerged PR, including all six locales.

At review head `77de23f54`, component-relative residual convergence could still
accept an inconsistent singular system. Coupling a large, exactly solved load
into a singular block joins their residual components and enlarges the shared
load denominator. Residual acceptance cannot establish numerical nonsingularity.

## Refusal rule

Let Z be the assembled real 2n-by-2n dynamic block matrix, with real and imaginary
parts K - omega^2 M and omega C. Let D contain the existing exact binary column
scales. The factored matrix is A = Z D^-1. Before factorization, compute
||A||_infinity = max_i sum_j |A_ij| from those actual scaled entries. After
factorization with partial row pivoting, require every pivot to satisfy

`abs(U_jj) / ||A||_infinity >= 1e-12`.

Both paths call the same check before applying a load. Non-finite ratios and
non-positive or non-finite matrix norms refuse. Sparse factors use their pivot
row indices, and dense factors use the LU row permutation. No additional dense
matrix or second factorization is required. Computing the norm is linear in
stored matrix entries and inspecting pivots is linear in the block dimension.

The fixed 1e-12 threshold is a numerical refusal policy. It compares elimination
pivots with the scaled matrix norm; it is not a condition-number estimate or a
universal forward-error certificate. Unlike any load-normalized residual, its
decision cannot be changed by scaling or replacing the load, including a zero or
compatible load. The existing absolute pivot cutoff remains an earlier refusal.
The existing column scaling, storage budget, modal selection and two compensated
refinement steps remain. Every accepted response must still satisfy the unchanged
per-component residual tolerance. No existing tolerance or numerical baseline is
relaxed.

## Connected inconsistent arrowhead

The regression starts with the existing synthetic arrowhead, N = 1024,
t = 1 - 383/2^26, M = I, omega = 1. Its stiffness block has leaf diagonals 2,
leaf-to-center entries -t, and center diagonal 1 + N t^2. Append one DOF with
K = 2 and M = 1, loaded by 1e12, while the center load is 1. Connect this appended
DOF to the first two leaves with stiffness entries +2^-20 and -2^-20,
respectively, symmetrically. These are synthetic numerical test inputs.

The dynamic null vector [t, ..., t, 1, 0] survives: the added row's two coupling
contributions cancel exactly. Its dot product with the load is still 1. Thus the
system is inconsistent, regardless of the appended load magnitude, and no finite
response solves it. All physical DOFs now share one residual component.

Before the fix, explicitly enabling the two known-wrong-result tests returned
finite center responses (-104093369406.46127, -0.0) on the dense path and
(-104093369406.45923, -0.0) on the sparse path. Both refusal assertions failed.
Commit A retains those tests with the required ignore reason. Commit B removes
the ignores and requires the numerical-singularity error on both paths. Earlier
independent-load arrowheads now also refuse at the factor check, before residual
refinement.

## Retained solutions

All eight existing `validation_harmonic_*` benchmarks still pass their unchanged
assertions: resonance peak, far-from-resonance response, damping peak reduction,
frequency-sweep envelope, two peaks, phase at resonance, half-power bandwidth and
anti-resonance. The #1539 3D cantilever reciprocity regression also still passes,
including its direct-reference checks. None of these cases changes to refusal.
The eleven harmonic integration tests, damped near-resonance closed forms and
coupled static closed forms also retain their assertions and pass. The new
connected-arrowhead refusal tests flip from failure to success; the pre-existing
singular-arrowhead tests remain refusals, now detected at the factor check.

**What to re-check:** direct harmonic responses from earlier versions of PR #1922
near singularity, including systems with connected loads of very different
magnitudes. This change adds refusals; it does not modify accepted response values.
The registry extends the existing harmonic notice. No new advisory is assigned;
the origin/main helper replay and its exposure limits are in the coordinator
handoff.
