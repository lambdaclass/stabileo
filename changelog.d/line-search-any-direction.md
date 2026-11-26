### Added
#### The line search on any step direction, among the opt-in nonlinear iterations (2026-11-24)

With the `experimental-nonlinear` Cargo feature,
`IterationMethod::LineSearch { direction }` runs the line search on the step of
Newton, modified Newton or Newton-Krylov. On Newton-Krylov it converges the
test frames the line search on Newton converges, in the same iterations, from
one factorization per load increment: a 3D building frame of 9,720 unknowns
solves in 0.9 s instead of 2.4 s. Default builds and the web app are unchanged.
