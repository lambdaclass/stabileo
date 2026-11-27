# Honor the line-search iteration budget on every load increment (2026-11-22)

The Newton line search from #2401 computed the end of an attempt by adding the
requested per-increment budget to the cumulative iteration count. Once a
previous increment had used an iteration, a large valid budget could overflow.
Native debug builds panicked. Optimized WASM builds wrapped the sum and returned
a nonconverged state for models that could reach the entire applied load.

Each attempt now starts with its own remaining budget. Every linearization,
including line-search trials and forced support corrections, consumes one unit.
The shared counter checks whether each actual iteration fits in the total
before linearizing. Exhausting the requested budget leads to the ordinary
nonconvergence path. An unrepresentable total returns an error.

The change applies to the opt-in 2D and 3D co-rotational line-search driver with
equal or adaptive load steps. A solve affected by the premature stop can now
return a different convergence status, iteration count, attained load factor,
displacements, reactions, and member forces. The native and WASM regressions
compare the highest supported budget with a budget sufficient for the same
input. The spring reproducer also checks the residual independently and crosses
the exact arithmetic boundary of the old implementation.

This entry is recorded in the experimental driver registry. The feature has
separate APIs and the production web app does not save results from them.
