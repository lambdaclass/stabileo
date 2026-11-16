# SA-2026-077: Wall wind loads omitted foundation forces and depended on subdivision

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-16; fixed in PR #2220, pending merge and release |
| Issue | [#2204](https://github.com/lambdaclass/stabileo/issues/2204) |
| Fix | PR [#2220](https://github.com/lambdaclass/stabileo/pull/2220); pending merge and release |
| Fixed release | Not released |
| Affected versions | Confirmed on origin/main `9d925a780`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`wind-physical-pressure-field`](../../web/src/lib/provenance/result-changes/wind-physical-pressure-field.json) |

## Affected features

Generated CIRSOC 102-2025 wall loads, including height-varying code pressure,
entered net-pressure profiles and service wind Wa. The generator is shared
TypeScript before native/WASM or linear/nonlinear analysis selection; the
saved-project regeneration notice applies in 2D, 3D and Pro.

## What was wrong

The generator assigned tributary height bands only to elevated mesh nodes,
omitting the foundation share of the loaded wall. Subdivision changed the
load distribution and total force without a warning or refusal.

On origin/main `9d925a780`, the #2204 witness is a 12 × 6 × 6 m frame of corner
columns under a +X net pressure profile of 1 kPa. The coarse mesh returns
18 instead of 36 kN total force; splitting the columns at midheight returns
27 instead of 36 kN. The overturning moment is 108 kN·m in the coarse case,
but the missing equivalent endpoint foundation share is 18 kN. This is an
endpoint diagnostic of the continuous wall load, not a separate applied
foundation force in the corrected model. These values come from the
[results-change record](../results-changes/2026-11-wind-physical-pressure-field.md)
and its independent wall integral. They are a witness, not an error bound.

An additional defect existed only on the unmerged PR #2220 branch: converting
integrated endpoint forces to singleton levels replaced the eccentric plan
couple with local column torques in cases 2 and 4. Total vertical-axis moment
alone did not detect the changed member forces and reactions. That branch
regression is corrected in this PR and is not additional main/release exposure.

This is a main-source replay, not a historical release-binary replay. Earlier
introduction and historical release exposure have not been assessed.

## How to tell if your model is affected

Review generated wall wind, including coarse or uneven vertical meshes and
regions starting above the foundation. Verify total lateral force, foundation
shares and overturning moment against the physical loaded height. A successful
solve does not establish that the complete wall load was generated.

## Fixed in

Fixed in PR #2220, pending merge and release.

The shared height-field integrator evaluates physical pressure and projected
width and emits distributed member loading over partial carrier intervals.
It preserves force, first moment and the load-work moments needed for member
response. Eccentric cases distribute a plan force couple over the active
cross-section as distributed member loads. The 18 kN equivalent endpoint
foundation share is diagnostic only; no explicit foundation nodal force is
applied. Unsupported distributed member torque is refused explicitly.

## Workaround

Until the correction is merged and released:
Independently integrate the wall pressure over its physical height and width,
including foundation force and moment, and apply a checked distribution of
eccentric cases before using the results.

## What to do with results you already have

After upgrading to a release containing the correction, review every wall and
roof opening record, reclassify the enclosure, regenerate W and Wa loads, then
rerun analyses, combinations and design checks. Re-solving stored generated
loads alone does not correct them. Review load distributions, governing cases,
member sizing, calculations and deliverables based on the old loads.

## Credits and references

The exposure is tracked as #2204. The coordinator assigned SA-2026-077.
The [results-change record](../results-changes/2026-11-wind-physical-pressure-field.md)
retains main witnesses, shared-path coverage, boundary tests and correct
controls. The fix is in PR #2220, pending merge and release.
