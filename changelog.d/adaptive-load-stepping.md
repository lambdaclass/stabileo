### Added
#### Adaptive load stepping for co-rotational analysis (2026-11-20)

In the experimental nonlinear checkout, the engine's `solve_corotational_2d_stepped` and `solve_corotational_3d_stepped`
take how the load is applied: in equal increments, as before, or adaptively,
where an increment that does not converge is retried at half the size and one
that converges easily doubles the next. With adaptive steps Newton reaches the
full load on slender cantilevers where four equal increments do not converge.
The existing entry points and their results are unchanged, and the web app does
not offer it yet.
