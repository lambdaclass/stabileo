# Inclined supports retain representable free loads (2026-11-11)

PR #1940, issue #761, first review correction. The initial branch implementation
could accept zero displacement under a real tangential load at an inclined
roller. It cleared free residual entries whenever their magnitudes fit a
projection error estimate derived from the restrained load. At a 45-degree
roller with restrained load `1e20`, the representable tangential load `65536`
falls inside that estimate. The exemption therefore removed physical loading,
not merely numerical error. This exemption existed only on the unmerged branch.

There is no longer any exemption based on restrained loading. Every free
residual enters the same physical equilibrium norm. The shared 2D, 3D and
triplet inclined vector rotations now use compensated products (`mul_add` for
the low product) and compensated summation. This also corrects linear and
prepared static loads, which previously used ordinary products and sums.
Fiber Newton corrections and final equilibrium verification use one shared
routine that rotates external and internal force vectors independently before
subtracting them; subtracting in global coordinates first can lose their small
free-force difference beside a large normal force.

A spatial support-only control additionally exposed cancellation in the
corotational natural rotations once its small projected load was retained.
When every nodal rotation and normalized chord increment is at most machine
epsilon, the shared natural-rotation function evaluates the infinitesimal
limit directly from displacement increments. Terms omitted from that limit are
second order in machine epsilon. It retains nonzero rotations and axial
extension instead of subtracting nearly equal absolute frames. Assembly,
member-force recovery and deformation diagnostics use that same function.
Finite rotations continue through the existing rotation-matrix calculation.
This numerical switch neither changes a convergence tolerance nor adds a
force-based acceptance allowance.

Native regressions cover all four nonlinear solvers in both dimensions, linear
and prepared static paths, and all three spatial planes. The independent axial
reference uses compensated product remainders of the represented global load,
not the nominal tangential load before rounding. Both `65536` and `262144` are
checked, on opposite sides of the removed exemption. Tests retain the existing
zero-strain, unit-rescaling, reflection, incomplete-iteration and tolerance
assertions. The same resolved-load cases pass through actual WASM exports,
including linear analysis and arc-length continuation. Inclined displacement
control retains its existing explicit refusal. A separate spatial cantilever control requires the linear-limit nonzero
response below the chord-coordinate ULP.

The existing nonlinear convergence registry entry now also requires members.
It continues to respect recorded P-Delta and nonlinear history, with the
repository's conservative handling of legacy unknown histories. The projection
entry applies to structural models with inclined supports, including linear
analyses. Re-check inclined-support results with large restrained loads and
small free loads; displacements, forces and convergence status can change.

The counterfactual run against origin/main `85c002b3a` also fails all ten
rotated-response tests. In particular, linear 2D and 3D return responses about
2.84% and 3.02% away from the independent references while reporting only
informational successful residual and balance checks. This establishes a
silently wrong main result from ordinary load projection, separately from the
branch-only zeroing exemption. No advisory is created here; its assessment and
number are left to the coordinator.
