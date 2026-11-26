### Added
#### Broyden's method among the opt-in nonlinear iterations (2026-11-24)

With the `experimental-nonlinear` Cargo feature, `IterationMethod::Broyden`
converges each load increment from one tangent factorization, correcting it
with secant updates. With adaptive load steps it reaches the full load on the
test frames that modified Newton does not converge. Default builds and the web
app are unchanged.
