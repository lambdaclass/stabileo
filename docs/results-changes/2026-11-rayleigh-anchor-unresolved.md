# Refuse damping whose anchor frequencies cannot be computed

Time history (2D and 3D) and the direct path of harmonic analysis apply Rayleigh damping
`C = a₀M + a₁K`, with `a₀` and `a₁` solved from the requested damping ratio at the model's first
two natural frequencies. When the eigensolve for those two frequencies returned nothing, both
used a "last resort" instead, with no warning: the smallest ratio of the diagonals of K and M
taken as a frequency. That ratio is not a natural frequency, and the damping it gives is not the
damping requested.

## What was wrong

Nightly model `fuzz_rich_3d/47056` (seed 47000; two frame members, a curved shell, a rigid
diaphragm, 32 free degrees of freedom, damping ratio 0.05), under ground motion:

| | path | a₀ | a₁ |
|---|---|---:|---:|
| the model as generated | eigensolve returns nothing, last resort | 8.69 | 2.16e-4 |
| the same model in other units | eigenvalues 452.65 and 2268.4 | 1.47 | 1.45e-3 |

The mass-proportional damping was about six times larger on the last-resort path, and the
displacement at t = 0.10 s was −3.887e-6 where the properly anchored model gives −4.218e-6:
7.9 % smaller, on the unconservative side. Whether the eigensolve fails on this model depends on
the sign of a pivot that is zero up to rounding, so the answer changed with the units (#2661).

## What changes

`rayleigh_from_modes` and `rayleigh_from_modes_sparse` refuse with `DAMPING-ANCHOR-UNRESOLVED`
when no natural frequency is computed, and time history and the direct harmonic path pass the
refusal on. A model with a single natural frequency is still anchored on it and on three times
it. A refusal that the initial state of a time history gives, such as `TH-MASS-SINGULAR`, is
still the one reported.

An analysis without damping is not affected. An analysis whose two frequencies are computed is
not affected: its numbers are the same.

## How many models

In the nightly metamorphic tier (about 240 models in 2D and 195 in 3D): with seed 20754 no row of
the time-history or harmonic tables changes; with seed 47000 one 3D model, the one above, moves
from a failing comparison to a refusal. The whole engine suite has no other change.

## What to do

Re-run a damped time history or direct harmonic analysis solved before this change. If it is
now refused, the response it gave before was computed with a damping other than the one entered
and should not be used. The eigensolve failing usually points at a mass matrix that is singular
or nearly so: check for degrees of freedom without mass coupled by constraints.
