### Changed
#### Adaptive load steps of the opt-in nonlinear drivers grow when an increment converges normally (2026-11-24)

With the `experimental-nonlinear` Cargo feature, adaptive stepping doubled the
load increment only after one that converged in two iterations or fewer, which
Newton rarely does at large displacements, so the increments only ever shrank.
It now doubles after eight linearizations or fewer and halves after more than
sixteen. On the nine test frames Newton takes 35 increments instead of 154 and
477 iterations instead of 926, to the same solutions. Default builds and the
web app are unchanged.
