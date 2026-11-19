# SA-2026-080: Floor-zone transfer lost eccentric member loading

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-16 |
| Issue | [#2201](https://github.com/lambdaclass/stabileo/issues/2201) |
| Fix | PR [#2282](https://github.com/lambdaclass/stabileo/pull/2282); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `9d925a78093db05bf8b50eb125aa829fa5dd955d`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`floor-zone-eccentricity`](../../web/src/lib/provenance/result-changes/floor-zone-eccentricity.json) |

## Affected features

Generated area loads and floor-load regions transferred to carrier members.
The geometry is shared before native/WASM and linear/nonlinear solver selection.
Saved-project recovery applies in 2D, 3D and Pro where these loads were generated.

## What was wrong

A unit-pressure zone x=0..1, y=0..6 on a 10 by 6 panel retained force 6 but its first moment about Y was 0.6666666666666663 instead of 3. Matching a corrected global first moment using end-node couples still failed to load restrained members in torsion. The end-node-couple defect was confined to the unmerged correction branch.

These figures are the retained main-source witnesses in the
[results-change record](../results-changes/2026-11-gravity-core.md#eccentric-floor-load-zones-are-refused).
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

0.6.2 (PR [#2282](https://github.com/lambdaclass/stabileo/pull/2282)). The floor-load compiler checks whether the member loads can act along each carrier axis. Centred one-way strips and compatible two-way zones can return member loads. If the zone requires eccentric member loading that the distributed-force model cannot represent, the whole definition is refused. Review and revise the definition before re-solving.

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

Tracked as #2201. The coordinator assigned SA-2026-080. The
[results-change record](../results-changes/2026-11-gravity-core.md#eccentric-floor-load-zones-are-refused)
retains the main replay and hand-solution checks. The merged correction is PR [#2282](https://github.com/lambdaclass/stabileo/pull/2282).
