# SA-2026-079: Gravity generation lost load under partial shell coverage

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-16 |
| Issue | [#2199](https://github.com/lambdaclass/stabileo/issues/2199) |
| Fix | PR [#2282](https://github.com/lambdaclass/stabileo/pull/2282); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `9d925a78093db05bf8b50eb125aa829fa5dd955d`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`gravity-shell-coverage`](../../web/src/lib/provenance/result-changes/gravity-shell-coverage.json) |

## Affected features

Generated area loads and floor-load regions transferred to carrier members.
The geometry is shared before native/WASM and linear/nonlinear solver selection.
Saved-project recovery applies in 2D, 3D and Pro where these loads were generated.

## What was wrong

A 10 by 6 panel with a shell covering width 4.76 carried total force 58.56 instead of 60 under unit pressure. Rotating the plan by 0.37 radians changed the force to 59.88743362831858.

These figures are the retained main-source witnesses in the
[results-change record](../results-changes/2026-11-gravity-core.md#partial-shell-coverage-on-beam-panels).
They are elementary area and first-moment integrals, not bounds on other models.
A successful analysis did not reveal the missing or misplaced load.
No historical release binary was replayed.

## How to tell if your model is affected

Review generated area loads, partial shell coverage and floor zones. Compare each
carrier's distributed load and internal forces with the physical tributary region.
Matching only the total force and moments does not establish member equivalence.
The recovery notice selects potentially affected projects; it does not establish
that every selected model had a wrong result.

## Fixed in

0.6.2 (PR [#2282](https://github.com/lambdaclass/stabileo/pull/2282)). The planner subtracts shell footprints in the carriers’ local coordinates. Supported uncovered strips transfer their reactions onto opposite carriers at the physical stations. Unsupported partial coverage blocks the plan before it emits loads.

## Workaround

Independently reconstruct affected physical regions and their per-member loading.
Verify force, shear, bending, torsion and deflection before relying on previous
results. An earlier successful solve is not evidence of correct load transfer.

## What to do with results you already have

After upgrading to 0.6.2, regenerate all affected
generated area loads. Refresh floor definitions or remove orphaned expanded shares
and reapply their physical floor loads. Then rerun analyses, combinations and design
checks. Re-solving stored generated loads alone does not repair them. Review member
sizing, calculations and deliverables that used the old loads.

## Credits and references

Tracked as #2199. The coordinator assigned SA-2026-079. The
[results-change record](../results-changes/2026-11-gravity-core.md#partial-shell-coverage-on-beam-panels)
retains the main replay and hand-solution checks. The merged correction is PR [#2282](https://github.com/lambdaclass/stabileo/pull/2282).
