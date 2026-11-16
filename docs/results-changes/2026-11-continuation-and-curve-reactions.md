# Continuation, chord rotations and reported soil reactions (2026-11-11)

PR #1940, issue #761, round 3.

Continuation from a loaded or settled state now uses the active restrained
positions to construct its support-to-free force reference. Unloading to zero
external force retains the starting admissible external load as a fallback.
Round 4 combines active support-to-free forcing with admissible external force
and retains a starting internal-force fallback at fully unloaded steps; see
[the reference correction](2026-11-continuous-settlement-reference.md).

Planar corotational chord angles use relative displacements directly. Spatial
natural rotations use rotation-matrix increments throughout composition and
local projection. Assembly, branch checks and reported member forces share the
same natural-rotation calculation, without a small-angle branch discontinuity.
This restores small rotated-member responses through corotational, arc-length
and displacement-control paths where those paths support the input.

SSI acceptance and reaction recovery evaluate the actual soil curves, rotate
their reactions into the assembly frame and check the admissible residual.
Positive initial soil stiffness participates in the physical length scale of
mixed point models. The same metric includes nonzero prescribed restrained
DOF categories when dimensions mix in coincident models.

Soil curves preserve nonzero reactions below the former absolute displacement
cutoff. Initial linear segments return their force and stiffness together.
Custom curves require strictly increasing nonnegative displacement coordinates;
a point at the origin must have zero reaction. Positive first coordinates still
interpolate from the origin. Unsupported preloaded origins, duplicate abscissae
and nonfinite evaluations refuse rather than inventing a secant response.

Nonzero prescribed settlements are retained at every scale. Constrained dense
and sparse paths use the shared prescribed-displacement builders. Both builders
and reverse inclined transformations use the compensated vector projection.
Both equilibrium summaries transform complete nodal forces to global axes
before adding them; an inclined node can no longer erase another node's load
through addition followed by subtraction in different frames.

Arc-length retains the stricter admissible equilibrium and reference-load
checks, but its supplied step length again uses the existing unweighted path
parameterization. The unchanged Ferrari–Sigmund Roorda replay is reproduced;
no replay values, acceptance tolerances or step adaptation rules were relaxed.
Round 4 also removes the displacement-control response cutoff.

Saved-result notices include shells, curved shells, connectors and springs.
Three-dimensional support curves imply SSI even when their static workflow
recorded a linear solve. Unknown histories retain nonlinear notices. The legacy
numeric comparison now evaluates each notice's analysis condition for the
static result being compared, as the snapshot gate already does; a nonlinear
notice cannot explain an arbitrary linear truss force change.

Re-run affected continuation, nonlinear, SSI, prescribed-settlement and inclined
support analyses. Accepted states, convergence status, reactions and equilibrium
summaries can change. No safety advisory is assigned here.
