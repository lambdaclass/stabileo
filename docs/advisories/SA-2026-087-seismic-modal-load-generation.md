# SA-2026-087: Generated modal seismic loads could give wrong member forces

| | |
|---|---|
| Severity | High |
| Status | Drafted 2026-11-19 |
| Issue | [#2209](https://github.com/lambdaclass/stabileo/issues/2209), [#2319](https://github.com/lambdaclass/stabileo/issues/2319) |
| Fix | PR [#2316](https://github.com/lambdaclass/stabileo/pull/2316), merged as `23fc68ff7`; generation refused pending [#2319](https://github.com/lambdaclass/stabileo/issues/2319) |
| Fixed release | Containment pending release |
| Affected versions | Confirmed on origin/main `5319f72147479ca62f0a8178ccdb102fd1f53750`. Historical releases and introduction unassessed |
| Re-check registry | [`seismic-modal-generation-unavailable`](../../web/src/lib/provenance/result-changes/seismic-modal-generation-unavailable.json), [`seismic-member-mass`](../../web/src/lib/provenance/result-changes/seismic-member-mass.json) |

## Affected features

Automatic modal (response-spectrum) seismic load generation and analyses,
combinations and designs using the generated cases. The affected step converts
modal results to loads before structural analysis. Modal analysis can still
report modes, periods and mass participation.

## What was wrong

The generator collapsed each mode's signed inertia field into story forces
and redistributed them using a single acceleration for each story. This can
move the load along a member and understate base bending even when the total
shear agrees. In the #2319 cantilever witness, uniform acceleration over the
weighted upper half places the resultant at 3 m instead of 28/9 m and gives
a base moment of 0.600164541 kN·m instead of 0.622392857 kN·m. The pre-merge
main planner also returned ready without a diagnostic. Its nodal forces at 2
and 4 m gave different member station forces from the distributed inertia
for the prescribed linear mode. [Issue #2319](https://github.com/lambdaclass/stabileo/issues/2319),
[results-change record](../results-changes/2026-11-seismic-modal-generation.md).

The earlier planner also averaged modal displacements at sampled nodes.
In #2209, adding a node on the same displacement field changed the story
forces, reduced the upper-story force and increased the reported
participation. The participation fallback could filter out vertically moving carriers before integration, distorting
the horizontal participation factor. [Issue #2209](https://github.com/lambdaclass/stabileo/issues/2209),
[participation finding](https://github.com/lambdaclass/stabileo/issues/2319#issuecomment-6995802501).

## How to tell if your model is affected

Check saved projects for seismic cases generated with the modal or
response-spectrum method. The saved-project notice flags earlier generated
seismic loads on open when their method was modal or their static origin
cannot be verified. For unmarked legacy loads recognized only through saved
settings, changing the seismic role or method setting can clear the notice on
reopen while the old loads remain. Check the loads and their generation
history directly. [#2333](https://github.com/lambdaclass/stabileo/issues/2333)
is still open.

## Fixed in

PR [#2316](https://github.com/lambdaclass/stabileo/pull/2316), merged as
`23fc68ff7`, refuses modal generation before creating cases, loads or
combinations. The redesign in [#2319](https://github.com/lambdaclass/stabileo/issues/2319)
remains open. It must preserve signed carrier inertia through the solve for
each mode and combine member responses at the locations where they are evaluated.

## Workaround

Use the static equivalent lateral force method where the model meets its
applicability checks. If the model requires the modal method, wait for #2319
before using automatic seismic load generation for that model.

## What to do with results you already have

Replace affected modal seismic loads by regenerating with the static method
where applicable, then rerun analyses, load combinations and designs. Review
member forces, deflections, sizing and deliverables based on the earlier loads.
If the static method is unavailable for the model, wait for #2319 to regenerate
modal loads. Review saved loads even if the regeneration notice has cleared.

## Credits and references

See [PR #2316](https://github.com/lambdaclass/stabileo/pull/2316),
[issue #2319](https://github.com/lambdaclass/stabileo/issues/2319) and the
[results-change record](../results-changes/2026-11-seismic-modal-generation.md)
for the member-response defect, generation refusal and saved-load notice.
