### Added
#### A line search and Anderson acceleration for co-rotational analysis (2026-11-20)

In the experimental nonlinear checkout, the engine's `solve_corotational_2d_by` and `solve_corotational_3d_by` take the
method that converges each load increment: Newton, modified Newton, Newton with an energy line search, or
modified Newton with Anderson acceleration. The line search reaches the
solution of a slender cantilever or arch under a load applied in one step, where
plain Newton fails or converges to another equilibrium. The existing entry
points and their results are unchanged, and the web app does not offer the new
methods yet.
