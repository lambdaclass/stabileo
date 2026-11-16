# SA-2026-074: Rafter subdivision removed explicit-panel eave snow

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-16; pending merge and release |
| Issue | [#2172](https://github.com/lambdaclass/stabileo/issues/2172) |
| Fix | pending |
| Fixed release | Not released |
| Affected versions | Confirmed on origin/main `9d925a78093db05bf8b50eb125aa829fa5dd955d`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`snow-panel-geometry`](../../web/src/lib/provenance/result-changes/snow-panel-geometry.json) |

## Affected features

Generated CIRSOC 104 snow with explicit panels (`loadEveryPanel: true`), including
faceted domes. Physical classification and full-precision tributary widths are
shared by generated roof and floor area loads; those loads are also affected.
Snow generation precedes native/WASM and linear/nonlinear solver selection,
with the saved-project notice applying in 2D, 3D and Pro.

## What was wrong

Panel roof classification used higher raw-member coverage. Subdividing a sloped
rafter raised a fragment's minimum elevation, so the same physical roof could
cover its own eave panel and silently exclude it from snow generation.

The retained faceted-dome witness has square rim (0,0,3), (8,0,3), (8,8,3),
(0,8,3) and crown (4,4,5). With the snow inputs in the
[results-change record](../results-changes/2026-11-snow-panel-geometry.md),
splitting one sloped rafter changes 5 nodes to 12, retaining 8 panel pieces.
The eave panel becomes `roof: false`; its balanced snow drops from
0.5441560854747155 to zero, without refusal or a classification warning. The
physical expectation is 0.7 × (70 − atan(2 / hypot(4, 4)) × 180/π) / 65.
This witness is not an error bound. The error is not assumed conservative.

This is a main-source replay; historical release binaries were not assessed.
Default tributary loading already diagnoses overlapping roof tributaries for
this witness; that diagnostic is retained.

## How to tell if your model is affected

Review generated snow with explicit roof panels, especially eave panels below
sloped framing and faceted domes. Check panel roof classification and eave snow
before and after subdividing rafters without changing the physical roof.
A successful solve does not establish that the generated loads are correct.

## Fixed in

Fix PR pending, pending merge and release. Panel classification uses physical
panel footprints and complete physical roof runs, independently of raw-member
fragmentation. Gravity and snow share that geometry layer. Full-precision
tributary widths and physical strip integration preserve force and moment. Existing engineering
inequalities, geometric matching limits and test tolerances are unchanged.

## Workaround

Independently verify physical panel classification and generated snow loads,
including force and moment under remeshing. Do not rely solely on an earlier
solve or the absence of a warning when explicit panels are enabled.

## What to do with results you already have

After upgrading to a release containing the correction:

Regenerate all affected generated area loads, then rerun analyses, combinations
and design checks. Re-solving
stored loads alone does not correct them. Review sizing, calculations and
deliverables based on the earlier generated loads.

## Credits and references

The coordinator reserved SA-2026-074 for #2172. The
[results-change record](../results-changes/2026-11-snow-panel-geometry.md)
contains the exact witness and independent physical expectation. Fix PR pending.
