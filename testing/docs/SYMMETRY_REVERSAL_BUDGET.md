# Exact symmetry and reversal assembly uncertainty

The November 12 nightly reports #1970–#1976 and #1978–#1985 expose two metamorphic harness defects. These changes affect generated verification models and comparison accounting. No production engine code or result changes.

## Exact construction

For 2D, subtract the largest input x coordinate from every x coordinate once. For 3D, subtract the chosen pivot's x and y coordinates once. Build both halves from these stored centered coordinates: reflection changes x's sign in 2D and x and y's signs in 3D, with zero translation. Floating-point negation is exact. The axis is exactly representable, each pair is an exact involution, and corresponding element coordinate differences have identical magnitudes. The rounding in centering defines the candidate half; its copy uses those same rounded values rather than independently rounding a translated endpoint.

Both constructors use the same finite-coordinate check. Reject overflowing centering and unsupported transformed geometry. A node joins the axis exactly when its centered coordinates are zero; a nearby node remains distinct. Existing constraints, supports, and axis-member exclusions still apply. Construction precedes analysis selection, so linear, nonlinear, native, and typed-adapter callers all consume the same geometry.

## Load assembly term

Let n be the reduced free-system order, m the number of loads, g the existing geometric amplification, and F the existing applied-action magnitude (`load_floor_2d` / `load_floor_3d`). F includes member actions and the equivalent actions from thermal strains and imposed displacements. The existing direct-solve operation envelope is q0 = 4(n + 24), as used by `Conditioning::rel`. Keep that envelope and add the m load accumulations:

```
q = 4(n + 24) + m
gamma(q) = q epsilon / (1 - q epsilon)
b_i = gamma(q) g F           for a translational force
b_i = gamma(q) g F Lchar     for a rotational moment
```

This is an absolute RHS uncertainty on the action scale before cancellation. A small assembled force from subtracting hinge-condensed fixed-end actions must not receive a relative allowance based only on that small remainder. There is no fitted multiplier and no changed comparison relative tolerance. The operation envelope and dimensional action magnitudes are the ones already used by the harness; the missing step was propagating their assembly contribution to displacement units.

If P maps reduced displacements to physical DOFs, the assembly term is bounded using

```
b_reduced = |P|^T b
assembly displacement error = |P| |K_reduced^-1| b_reduced
```

`physical_rows` supplies P, including constraints and inclined supports. The existing `Inverse` verifies the inverse defect and propagates its tail in `absolute_solve`. Accumulation and final row products receive their own gamma operation bounds. Both dimensions call one `assembly_errors` implementation. Its inputs come only from the model, not the candidate result. The same calculation runs on both the original and reversed model, before the original response is mapped to reversed member conventions.

An artificial DOF with zero applied load and an exactly decoupled stiffness row has no member-load uncertainty: releases set those entries to zero. Do not invent an action on that artificial spring. A nonzero applied load does not take this exemption. The existing bounded-inverse limit is retained; inability to obtain a budget is recorded as a refused comparison, on either side, rather than a pass or an engine failure.

All linear-static adapters and adapters in the existing `REDUCES_TO_LINEAR` classification use this path for reversal. Nonlinear and dynamic analyses retain their own accuracy models. The assembly term covers displacement/rotation items; existing force/reaction comparison accounting remains unchanged.

## Absolute error isolation

`analysis_accuracy::compare_scaled` originally converted absolute error certificates into family scale floors. That could transfer a soft rotation's uncertainty into translations through the dimensional sibling floor, or transfer one node's uncertainty into another node. The first isolation fix subtracted the sum of the two absolute error bounds from the matching discrepancy. Issue #1991 demonstrated that this inadvertently added the absolute bound to the relative allowance for every relation.

The shared `compare_compliant_bounded` comparison now keeps the original discrepancy and uses a per-component scale `max(S, E / rel)`, where S is the unchanged ordinary scale and E is the sum of the matching two error certificates. Its tolerance is `rel * max(S, E / rel) + MIN_POSITIVE`. This preserves the original division/multiplication order for absolute bounds and is the original maximum rule without cross-component leakage. When `E / rel <= S`, both the tolerance and the reported discrepancy ratio are bit-for-bit unchanged. Otherwise the bound applies only to that component. The old family maximum was at least as large, so removing its cross-component effects can only tighten a comparison. No discrepancy is reduced, and relative and absolute allowances are never added.

The assembly certificate is still attached only to the two local response copies used by the static-equivalent reversal relation. It is not attached to an adapter's baseline response or any non-reversal relation. Both dimensions share the assembly calculation and the bounded comparison. Nonfinite values, negative/nonfinite errors, overflowing combined bounds or scaled component budgets, response-shape differences, and refusal identities remain failures. No absolute error increases another result's magnitude scale.

## Regressions and scope

`nightly_harness.rs` has a separate test for each of the fifteen issues, using the two exact shared models from PR #1989's fixture archive. The nightly reversal seed is 2026111206980; symmetry uses 2026111203040. Reversal retains the reported `replay` case name and invariant prefix to preserve RNG consumption. Symmetry tests both symmetric and antisymmetric loads. Each cell requires actual passing comparisons.

Class coverage includes exact involutions and axis membership in 2D/3D, overflow refusal and a finite geometry control, every static adapter and all three plane embeddings for reversal, and linear/nonlinear adapters for symmetry. Antisymmetry retains its linear-law restriction. Absolute-bound tests exercise both signs, the bound and its immediate floating-point successor, cross-node/cross-family isolation, and invalid certificates. Synthetic systems test both sides of the existing inverse-size limit and artificial-load exclusion.

`seeded_failures.rs` retains its existing checks and adds sign, unit-scale, and stiffness perturbations for both relations in both dimensions. The symmetry seed subdivides the witness member once to provide a paired free node: changing a permitted component only on an axis node would itself preserve the symmetry relation and cannot be a useful fault injection. Every injected fault is reached; the correct controls must pass, and wrong responses must produce a failure rather than refusal or inconclusive status.

The construction and assembly certificates live in the native Rust test harness. The shared comparison loop is engine metamorphic verification support with no production solver callers. The `linear (WASM typed path)` adapter is exercised along with the other static adapters; it invokes the typed engine API natively. There is no exported WASM entry point for either changed harness function. No production WASM rebuild or browser suite is needed to reach this code.

Issue #1991 adds an original-budget oracle and quantitative tests for thirteen response kinds, the absolute/relative crossover and its neighboring representable values, direct and scaled comparisons, all static-equivalent adapters, and supported nonlinear adapters in 2D and every 3D plane. Correct controls pass; seeded displacement faults must fail under both the original and corrected budgets. The existing ordinary-ratio guard remains unchanged.

No relative tolerance, assertion threshold, known-failure baseline, engineering admission limit, or production analysis is changed. These findings do not establish a silent wrong production result. No advisory or results-change registry entry is warranted for this verification-only change.
