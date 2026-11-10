# Exact plastic certification refuses excessive LP construction work (2026-11-10)

Results-change entry `plastic-exact-resource-budget-refused`.

The exact plastic certificate previously bounded members, but not the dense LP
construction those members cause. Section samples, load-piece boundaries,
biaxial polygon directions and the equilibrium variable count determine its size.
A small member count can cause substantial work. Conversely, the existing
24-member grid-slab seed has only nodal loads and a relatively small tableau,
but its larger dual-variable bound permits much more simplex work. Memory alone
is therefore not an adequate admission rule.

The engine now exposes `PlasticLpWork`, calculated alongside the actual 2D/3D
sample construction. Its conservative bounds include all permitted refinement
passes, section insertions and polygon-direction insertions. The equilibrium row
count is obtained without allocating the equilibrium matrix. The simplex's
unchanged iteration multiplier supplies the initial pivot-work estimate.

Before exact equilibrium elimination or candidate LP construction, the engine
refuses a model if its nominal dense storage bound exceeds 1 GiB, or its initial
tableau-cell/pivot bound exceeds 2^31. The combined 3D entry point applies the
same check before running the incremental solver. Both dimensions' independent
candidate entry points enforce it as well. Overflow saturates and refuses.
The error names the exact plastic LP resource budget and suggests reducing
members or load intervals. This changes availability, not a collapse number.

These are conservative admission policies, not measurements of allocated memory
or universal execution-time bounds. Rational limbs, matrix copies, exact checking
and mechanism recovery add costs beyond the nominal storage calculation.
The independent bounded replay remains necessary to detect leaks, hangs and
unexpected growth on admitted inputs.

The separate browser-reachable #743 reproducer is checked in as
`engine/fuzz/corpus-regressions/plastic-lp-budget/engine-grid-slab.bin`. Its bounded
pre-fix replay timed out after one second without a result. The repository had
already recorded a native run lasting over 25 minutes in `FUZZ_MUTANTS.md`; this
investigation did not repeat that heavy run. The new preflight returns a resource
refusal in the same one-second watchdog. The raw incremental 3D API does not build
this exact LP and retains its existing behavior and warnings.

The registry flags frame projects after plastic analysis, in either dimension.
The 2D combined API's existing `PL-2D-INVARIANCE` refusal remains in place.
No engineering tolerance, numerical baseline, assertion bound, or simplex
iteration limit is loosened. See [the derivation and measured replay table](../verification/PLASTIC_LP_BUDGET.md).
