# SA-2026-116: Nonlinear analysis could accept an incorrect load path or omit a tangential load

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2510](https://github.com/lambdaclass/stabileo/issues/2510), [#761](https://github.com/lambdaclass/stabileo/issues/761) |
| Fix | PR [#2539](https://github.com/lambdaclass/stabileo/pull/2539), merged as `38513a4f9` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | The planar arc-length acceptance logic dates to `1d4a76138` (first numbered release 0.2.0). Planar co-rotation can solve in inclined support axes from 0.2.0 and accepts a native warm start from 0.6.0. The curved-frame shear-centre check gap dates to `fe99db4aa` (0.3.0). The production WASM witnesses were replayed in 0.6.4 |
| Re-check registry | [`planar-nonlinear-trial-state`](../../web/src/lib/provenance/result-changes/planar-nonlinear-trial-state.json), [`curved-frame-shear-centre-refusal`](../../web/src/lib/provenance/result-changes/curved-frame-shear-centre-refusal.json), [`inclined-planar-load-projection`](../../web/src/lib/provenance/result-changes/inclined-planar-load-projection.json) |

## Affected features

Planar arc-length and co-rotational analysis, including native
co-rotational continuation from a solved state. Spatial co-rotational
analysis is affected when curved frames use a section with an offset
shear centre. The release witnesses use the production WASM exports.

## What was wrong

Planar arc length could accept equilibrium outside the requested
continuation sphere or retrace an earlier part of the load path while
reporting convergence. In the two-bar regression, the accepted second
increment had a radius of about 3.91 with a requested radius of 3.

Planar co-rotation could round separately specified loads before
projecting them onto an inclined roller's free direction. In the
split-load regression, it reported convergence at full load and zero
axial displacement even though the tangential force should move the
tip. The affected arc-length export explicitly refused the same split
load as a zero reference load. Native co-rotational warm starts could
also lose part of the target load or prescribed motion during the ramp.

Spatial co-rotation checked shear-centre offsets before expanding
curved members into frames. A curved-only model could reach full load
without the flexural-torsional coupling implied by its section.

[Results-change record](../results-changes/2026-11-production-nonlinear-drivers.md)
and [inclined-roller record](../results-changes/2026-11-inclined-planar-load-projection.md).

## How to tell if your model is affected

Review planar arc-length paths for prior accepted points that missed
the configured radius, violated displacement ties or retraced the
branch. Check planar co-rotational models for loads with a small
resultant along an inclined roller, or continuation from a much
larger load or prescribed displacement. In spatial co-rotation,
check the section properties of all curved frames for shear-centre
offsets.

## Fixed in

The next release after 0.6.4. PR
[#2539](https://github.com/lambdaclass/stabileo/pull/2539) requires each
accepted arc-length point to satisfy equilibrium and the continuation
constraint in the forward direction. Planar solvers project assembled
load patterns into the support axes before rounding and use the same
loads for solving and recovery. Co-rotational warm starts retain the
assembled target load and prescribed positions. Spatial co-rotation checks the
sections of the expanded frames and refuses an unsupported offset.

## Workaround

Use an independently verified nonlinear solver for affected cases
until the fixed version is available.

## What to do with results you already have

Rerun affected planar nonlinear analyses from the original loading
and support conditions, including any states used to start a
continuation. Review the accepted load path, displacements, reactions
and forces. Rerun affected spatial co-rotational analyses. If an
offset is refused, use a verified method that models the coupling.
Repeat dependent design checks and regenerate affected reports.

## Credits and references

See [issue #2510](https://github.com/lambdaclass/stabileo/issues/2510),
[issue #761](https://github.com/lambdaclass/stabileo/issues/761) and
[PR #2539](https://github.com/lambdaclass/stabileo/pull/2539) for the
reports, fix and [production WASM regressions](https://github.com/lambdaclass/stabileo/blob/38513a4f9/scripts/tests/nonlinear-drivers-2510-wasm.mjs).
