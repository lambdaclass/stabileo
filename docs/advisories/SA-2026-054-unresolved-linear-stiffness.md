# SA-2026-054: Linear analysis could silently return inaccurate results from unresolved stiffness or missed PCG load components

| | |
|---|---|
| Severity | High |
| Status | Draft; fix prepared locally, pending merge and deployment |
| Issues | [#762](https://github.com/lambdaclass/stabileo/issues/762), [#1496](https://github.com/lambdaclass/stabileo/issues/1496); stability review of PR #1753 |
| Fix | PR [#1753](https://github.com/lambdaclass/stabileo/pull/1753); not yet merged or deployed |
| Affected versions | Builds of main before #1753, including the main merged into this branch; first affected deployment not yet bisected |
| Re-check registry | results-change entry `linear-stability-refusals` |

## Affected features

Linear static analysis in 2D and 3D, including dense, sparse, PCG, constrained and prepared
multi-case paths, with mechanisms, near-mechanisms or extreme coupled stiffness contrasts.
It also covers PCG with `preconditioner = "none"` and independent moment components of
very different magnitudes, even with resolvable stiffness.
The app also uses the static solve before P-Delta, modal and buckling workflows. This fix
certifies their static entry, not their later tangent or eigenvalue calculations.

## What was wrong

The old linear solves could add artificial rotational stiffness, shift a failed factorization
or switch to LU and return a number. Their raw diagonal and pivot warnings depended on units,
orientation and numbering, and did not reliably identify every unresolved stiffness.

The recorded `fuzz_rich_3d/74` reproducer returned a result on main **without a conditioning
warning**, although its scaled condition number times node anisotropy was `7.9e13`, beyond
the new load-independent `1e12` gate. The metamorphic harness rated every transformed copy
inconclusive. Other recorded cases moved under equivalent units: #993 drifted `1.4e-4` and
#1115 `2.9e-4` in the stability investigation. These are measured numerical discrepancies,
not comparisons to a published engineering reference. The direction and size of error depend
on the model and load; this advisory does not claim a known correct displacement for seed 74
or a measured percentage of unconservatism for it. Its correct outcome is to withhold the
answer because its numerical accuracy cannot be established.

A test-only probe in a detached worktree of main `34987d390` also returned `Ok` for both
linear and buckling on the original `buckling-1465.json`, which applies a moment to a
released tip rotation. The moment cannot be equilibrated physically. Main returned very
large rotations and a buckling factor `0.03262079582380868`, together with singular-pivot,
LU, high-residual and NUM-INVARIANCE warnings. This is another warned unresolved rotational
solve covered here, not a clean result with independently established static accuracy.
The fixed entry points refuse it with node 2 and the loaded rotational direction named.

Review round 1 also established a **25% displacement error with no warning** on main
`8f4c3ee6c`. Two axial DOFs tied by `u1 = u2` have a unit-length member of stiffness
`M = 1e16` between them and a support spring of stiffness `3`. Under axial force `1`,
the member cannot extend and the correct displacement is `1/3`. Assembly rounds `M + 3`
to `M + 4`; constraint reduction cancels the member terms and leaves `4`, returning `0.25`.
The minimal example is caught by main’s final force-balance check. With an independent
load `fz = 1e6` at a fully restrained third node, a detached, test-only probe of main
returned `0.25` at both axial nodes. Its reduced residual was zero, its aggregate balance
measure was `1.2499989062509567e-7`, and all four structured diagnostics were informational.
The independent balanced load hides the axial imbalance in the aggregate measure. In this
example the displacement is underestimated; the direction of error in another model is not
established. The fixed gate carries `|C|ᵀ |K_original| |C|`, retaining the magnitudes of the
cancelled contributions, and refuses both versions before factorization. Regression:
`issue_1753_an_independent_load_cannot_mask_constraint_cancellation`.
The [main probe evidence](../results-changes/1753-main-constraint-cancellation-probe.json)
retains the returned values and diagnostics.

Review round 2 established a separate **98.72% component error with no warning** on main
`8f4c3ee6c`, using PCG with the supported setting `preconditioner = "none"` and its unchanged
default iteration tolerance `1e-8`. A released node has independent rotational springs
`krx = kry = krz = 1e6`, and applied moments `Mx = 1000`, `My = 1e-5`, `Mz = 0`.
Adjacent member bending releases leave the y rotation supported only by its spring;
its signed equilibrium rotation is `My / kry = 1e-11`. At this load ratio of `1e8`, main
returned `ry = 1.2833168805528135e-13` after one iteration. It reported aggregate relative
residual `9.871668311944719e-9`, a PASS static residual `8.714121303486764e-8` and zero
aggregate balance error. All four structured diagnostics and its solver diagnostic were
informational. Regular and prepared solves agreed. A second case at load ratio `1e9`,
with `kry = 1e3` and `My = 1e-6`, returned `ry = 1.283316880552813e-14` instead of `1e-9`,
also without a warning. The independent large moment masks the small component's error
in the aggregate checks. The absolute rotations in these examples are small; the percentages
describe the component error, not an established error in a design capacity or safety factor.

`1e8` was the smallest tested ratio with a silent wrong component; probes at `1e3`, `1e6`
and `1e7` solved correctly. Default shifted-IC preconditioning solved these two cases
correctly. Loaded free rotations were refused at every tested ratio through `1e9`, so
this finding does not establish a silent unsupported-rotation failure on main. The
[main probe inputs, values and diagnostics](../results-changes/1753-main-load-ratios-probe.json)
and [reproduction details](../results-changes/2026-11-linear-stability-refusals.md#advisory-review-realistic-load-ratios-on-main)
record the scope. The fix requires each PCG row to satisfy its existing residual threshold
as well as the aggregate check, and uses the existing fallback chain if any row fails.
Regression: `issue_1753_pcg_resolves_each_independent_moment_with_disparate_loads`.

For a component with anisotropy `A`, the first-order relative shift bound for the smallest
scaled eigenvalue is `ε κ_S A`. Separate uncoupled directions cannot exchange assembly
rounding; directions mixed by an element transformation can. The fix retains that coupling
even if assembled off-diagonal entries cancel, and refuses when the product exceeds the gate.
Constraint reduction additionally retains an entrywise absolute contribution envelope; judging
only the small reduced stiffness would lose the rounding scale of cancelled contributions.
See [the numerical argument and evidence](../solver/stability.md), and the regression tests
in `engine/tests/metamorphic/stability.rs` and `engine/tests/known_issues.rs`.

## How to tell if your model is affected

Re-check past linear results if a model has very soft restraints, released member directions,
extreme member or spring stiffness contrasts, constraints that cancel large member stiffnesses,
very thin shells, or responses that change
when equivalent units, orientation or node numbering are used. An absence of a conditioning
warning in the old result does not establish accuracy. A large contrast between independent,
axis-aligned directions alone does not establish that the model is affected. For PCG
with preconditioning disabled, also review cases with disparate independent loads; an
aggregate PASS check does not establish each component's accuracy.

The `linear-stability-refusals` re-check entry flags linear models with hinges, springs,
constraints, connectors, inclined supports, eccentricities or curved shells. These features
include the measured PCG fixtures. The saved feature set cannot evaluate `κ_S A` or detect
every affected PCG model; an unflagged project is not an accuracy certificate. Most ordinary
models keep their results. Run the fixed solver to determine whether a model is refused or
a PCG component changes.

## Fixed in

Prepared for the first deployment containing PR #1753, after 0.5.0. This local branch has not
been pushed, merged or deployed. Re-run only in a build that includes the fix.

The linear solve checks the physical stiffness before factorization, without artificial
springs. It refuses mechanisms, unresolved condition bounds and non-positive-definite systems;
a factorization fallback cannot override that decision. The product gate has not been relaxed.
The axis-aligned Winkler/SSI tests solve again using coupling components, and three rotated
copies must agree or refuse. The thin strip retains its unchanged closed-form reference check.

Plastic 3D's existing soft-spring hinge-state exception is confined to its prior path. Its
member-force balance and moment-diagram closure checks do not certify displacement accuracy.
Hinge states with constraints or connectors, previously accepted without their forces being
checked, are explicitly refused on that path.

## Workaround

Until the fix is deployed, do not rely on the absence of warnings for the models described
above. Independently verify their numerical accuracy using a solver and precision appropriate
to the stiffness contrast, or revise the structural restraints and releases with engineering
justification. Changing only units or numbering is not a repair. Do not add arbitrary springs
to force a solve or use an answer from a transformed copy to bypass a refusal. For a
resolvable model with disparate loads, use the direct solver and independently check each
loaded direction's equilibrium until the PCG fix is available.

## What to do with results you already have

Re-run affected static load cases and combinations in a fixed build. If the model is refused,
re-check displacements, member forces and any design, serviceability, buckling or dynamic
conclusions that depended on that static result before relying on them. A refusal supplies
no replacement engineering result.

## Credits and references

Found through the #762 invariance investigation, the C08 metamorphic corpus and the
coordinator's code review of PR #1753. The source of the numerical values above is the
recorded evidence in [stability.md §2.5](../solver/stability.md) and its checked-in reproducer
harness; the [results-change write-up](../results-changes/2026-11-linear-stability-refusals.md)
records which answers become refusals and which verified references still solve.
