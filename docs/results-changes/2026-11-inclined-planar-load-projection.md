# Preserve planar nonlinear loads at inclined rollers (2026-11-24)

PR #2539, following the inclined-roller regression from issue #761.

The planar nonlinear load path now projects each exact assembled load pattern
into the solver's support axes before rounding. Arc length and co-rotation
apply load factors to those projected resultants. Equilibrium and force
recovery use the same projected loads.

In the rotated #761 fixture, rounding the scaled global force components
before projection changed the converged axial displacement by about 2%.
When the normal and tangential loads arrived in separate records, early
rounding could erase the tangential load and cause a false zero-reference
refusal. A reference load entirely normal to the roller still produces that
refusal. Displacement control refuses inclined rollers at every angle.
