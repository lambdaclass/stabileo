# P-Delta uses equilibrium corrections under rotation (2026-11-12)

PR #1940. The `metamorphic_pr_3d` seed `20261018` reports a P-Delta rotation
failure for `feature_matrix/3d-plate--dkt-triangle--strip-cantilever------0-equiv`.
Despite its DKT feature name, the `equiv` fixture is a frame-chain equivalent:
it contains no plate elements. The original solves, but its general rotated and
translated copy alternates between two total-displacement solutions and reaches
the iteration limit. The relative increment stays near `6.487e-12`, above the
unchanged `1e-12` request, even though its relative equilibrium residual is below
the request. Neither a drilling DOF reference nor an out-of-plane scale causes
this witness; the geometric length and the metric's scalar/vector weights are
rotation invariant in exact arithmetic.

Previously each step solved for the full new displacement vector, independently
of the preceding iterate. Tiny changes in the rotated tangent cause fresh
factorization/solution rounding to alternate between total solutions. P-Delta
now solves `(K + K_G(u)) delta = f - (K + K_G(u)) u` and adds the correction to
the existing free displacements. Its residual calculation retains compensated
products and sums. This is the same fixed-point iteration in exact arithmetic,
but the correction is computed directly at its own scale. Restrained values
stay in the state; constraint reduction acts on the residual and the correction.

Both dimensions, both matrix storage paths and all public P-Delta APIs use the
same correction primitive. The existing iterate-change and independently
reassembled equilibrium-residual checks both still have to pass. No tolerance,
iteration budget, assertion or baseline was relaxed. Linear solve behavior and
other nonlinear methods are unchanged.

The exact seeded witness is an active regression. Its class tests cover real
DKT and MITC4 strips, their frame equivalents, a planar frame, general rotations
and linear controls. They require numerical comparisons, rather than accepting
refusals as success. Native and actual WASM tests cover ordinary and certified
P-Delta exports, zero and one iteration, the first successful budget and one
iteration below it, and zero-load answers. Deliberately zeroed nonzero WASM
responses must fail. Existing independent cantilever references also exercise
the shared update.

Re-run P-Delta analyses. Convergence verdicts and iteration counts can change,
as can last-bit displacements, forces and reactions. This change addresses a
false refusal on the branch; it assigns no safety advisory.
