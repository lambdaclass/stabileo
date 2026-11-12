# Nonlinear convergence uses physical equilibrium in every frame (2026-11-11)

Issue #761. The four original support-load models, `random-29`, `random-32`,
`random-41` and `random-49`, have an exact zero-strain equilibrium: their loads
act only in restrained directions. At origin/main `85c002b3a`, all four rotated
P-Delta copies refuse convergence. Fiber also refuses the reported mirrored
`random-29` and rotated `random-41` copies. The untransformed models solve with
zero displacement. This is a false refusal; this evidence does not establish
a silently incorrect engineering response.

P-Delta previously divided a mixed displacement/rotation increment norm by a
mixed displacement/rotation norm, but only when that norm exceeded an absolute
cutoff. Roundoff below that cutoff could never converge. Fiber and corotational
used mixed force/moment norms and switched to an absolute residual near zero
load. Material nonlinear and both path correctors had related absolute reference
floors. Reduced constraint coordinates also mix translations and rotations and
are generally not an orthonormal basis; their raw Euclidean norm is not a
physical norm.

All these acceptance decisions now use `solver::convergence::EquilibriumMetric`.
For a model length L, the displacement metric has weights 1 for translations,
L for rotations and L² for warping derivatives. Its dual measures forces,
moments/L and bimoments/L². L is the maximum distance from the geometric centroid,
independent of node labels, rigid frame and reflection, and scales with length
units. Coincident models use dimension cancellation or physical stiffness scales;
see [the second review correction](2026-11-supported-and-soil-equilibrium.md).
Scaled `hypot` accumulation avoids squaring large or tiny dimensional values.

For constraints u = Cq, the residual norm is
`sqrt((Cᵀr)ᵀ (CᵀW²C)^(-1) (Cᵀr))`, where W contains the displacement weights.
The sparse Gram matrix is column-normalized and factored once per run. This
measures residual work on the actual admissible displacement space, independent
of its coordinate representation. A failed metric factorization refuses.

A zero projected reference requires zero checked residual. There is no absolute
force or displacement reference, and no residual exemption based on a restrained
load. Applied loads use compensated products and summation in the shared inclined
support projection. Fiber projects applied and internal forces independently
before subtracting them, in both its Newton corrections and final audit. A
representable free load must reach equilibrium even when it is only a few ULPs
above cancellation resolution beside a large restrained load. See
[the projection correction](2026-11-inclined-load-projection.md).

The relative residual uses the admissible external-load norm. Support-driven
continuations with zero admissible external load use the support-to-free
coupling forces, excluding direct restrained reactions. Non-finite data refuses. P-Delta retains its relative
iterate-change requirement, measured in the physical displacement metric without
an absolute cutoff, and additionally evaluates the equilibrium residual using
the geometric stiffness rebuilt at the candidate state. It cannot accept merely
because two iterates stopped changing. Neither the requested tolerances nor
existing test assertions are relaxed.

The shared acceptance sites are P-Delta 2D/3D, fiber 2D/3D, corotational 2D/3D,
material nonlinear 2D/3D, 2D arc-length and 2D displacement control. Fiber's
reassembled final equilibrium audit uses the same metric. Dense and sparse
P-Delta paths enter the same checks. Arc-length and displacement control also
recognize exactly zero reference loads rather than an absolute force cutoff.
The admissible norm guards the reference load. Round 2 also used that norm in
the arc-length force term; round 3 restores the existing unweighted path
parameterization after the unchanged Roorda replay exposed the difference.
Step adaptation is unchanged. See the continuation and curve-reaction record.

The regression tests retain the four exact original fixtures and the nightly
seed/name combinations for their rotation and mirror witnesses. They cover the
linear controls, four nonlinear analyses, 2D, planar embeddings in all three
3D planes, and fully spatial fixed-base/roller equivalents permitting arbitrary
3D rotations. Unit changes, closed-form axial responses, incomplete iterations,
non-finite inputs, zero references, both sides of the tolerance and former projection
exemption, and mixed force/moment constraint metrics are checked. The WASM test
uses the same generated cases as native exports. Existing collapse and
last-converged-state tests retain their assertions.

**What to re-check:** nonlinear analyses previously refused solely after rotation,
reflection or consistent rescaling; analyses close to their convergence threshold;
and dependent results from a different final accepted increment. Iteration counts,
convergence status, carried loads and final response values can change. The issue's
separate shell and general-frame allegations require their own exact reproductions;
this support-load evidence does not resolve all of them. No advisory is assigned.
