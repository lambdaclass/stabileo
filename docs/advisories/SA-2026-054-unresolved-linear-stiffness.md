# SA-2026-054: Linear analysis could silently return a result whose stiffness cannot be resolved in double precision

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-09; fix prepared locally, pending merge and deployment |
| Issues | [#762](https://github.com/lambdaclass/stabileo/issues/762), [#1496](https://github.com/lambdaclass/stabileo/issues/1496); stability review of PR #1753 |
| Fix | PR [#1753](https://github.com/lambdaclass/stabileo/pull/1753); not yet merged or deployed |
| Affected versions | Builds of main before #1753, including the main merged into this branch; first affected deployment not yet bisected |
| Re-check registry | results-change entry `linear-stability-refusals` |

## Affected features

Linear static analysis in 2D and 3D, including dense, sparse, PCG, constrained and prepared
multi-case paths, with mechanisms, near-mechanisms or extreme coupled stiffness contrasts.
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

For a component with anisotropy `A`, the first-order relative shift bound for the smallest
scaled eigenvalue is `ε κ_S A`. Separate uncoupled directions cannot exchange assembly
rounding; directions mixed by an element transformation can. The fix retains that coupling
even if assembled off-diagonal entries cancel, and refuses when the product exceeds the gate.
See [the numerical argument and evidence](../solver/stability.md), and the regression tests
in `engine/tests/metamorphic/stability.rs` and `engine/tests/known_issues.rs`.

## How to tell if your model is affected

Re-check past linear results if a model has very soft restraints, released member directions,
extreme member or spring stiffness contrasts, very thin shells, or responses that change
when equivalent units, orientation or node numbering are used. An absence of a conditioning
warning in the old result does not establish accuracy. A large contrast between independent,
axis-aligned directions alone does not establish that the model is affected.

The `linear-stability-refusals` re-check entry flags all projects using linear analysis. This
is deliberately broader than the unresolved matrices: the saved feature set cannot evaluate
`κ_S A`. Most ordinary models keep their results. Run the fixed solver to determine whether
the assembled model is refused.

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
to force a solve or use an answer from a transformed copy to bypass a refusal.

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
