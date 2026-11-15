# SA-2026-067: Plan rotation changed balanced snow loads

| | |
|---|---|
| Severity | High |
| Status | Drafted 2026-11-14; published 2026-11-15 |
| Publication | 2026-11-15; included in 0.6.1 |
| Issue | [#2093](https://github.com/lambdaclass/stabileo/issues/2093) |
| Fix | PR [#2095](https://github.com/lambdaclass/stabileo/pull/2095); released in 0.6.1 |
| Fixed release | 0.6.1 (2026-11-15) |
| Affected versions | Reproduced on origin/main fb241aa04936a993a3ecd4a2ec4f9490669c1d34, also the v0.6.0 tag; older releases not assessed here |
| Re-check registry | [snow-roof-rotation](../../web/src/lib/provenance/result-changes/snow-roof-rotation.json) |

## Affected features

CIRSOC 104-2005 snow loads generated for member roofs, and every analysis,
combination, design check or export consuming those loads. The generator
runs in TypeScript before the native/WASM solver boundary. Changing the
analysis method cannot repair an incorrect generated load. Manually
entered, independently verified snow loads are outside this defect.

## What was wrong

The retained witness is stepRoof(20, 0, 0.45, angle), with width-one
member 500. On main, rotating the whole geometry in plan from 0 to
0.37 rad changes its generated balanced line-load magnitude from
0.7692307692307692 to 0.5384615384615383 kN/m: a 30% reduction.
The corrected balanced component is 0.7692307692307692 kN/m at both
orientations. The separate step-drift correction in SA-2026-065 adds
its surcharge in panel mode; do not confuse the balanced component with
the total load after drift.

The old roof width came from a global X or Y bounding extent. Rotation
could move the same physical roof across CIRSOC 104 section 3.4's low-slope
minimum threshold and could change unbalanced-case admission.
Roof-plane gradients and projected coordinates now supply width,
ridge-side classification and partial-load spans. Tests retain several
rotations, translations and reflections; an arbitrary plan orientation
does not alter the physical snow demand.

The existing generic note about snow features not covered did not identify
these calculated loads as wrong. The witnesses produce numbers without a
refusal or a warning naming this defect.

## How to tell if your results are affected

Review projects with generated CIRSOC 104 snow, their original geometry
and load-generation settings. Check roof steps, pitched receiving surfaces,
roof-plane geometry and orientation. The automatic notice conservatively
selects snow projects with generated-load records or a load-generation basis.
Historical files without that metadata still require manual review; absence
of an automatic notice does not establish that their snow loads are correct.

## Fixed in

Version 0.6.1 includes PR #2095. The correction shares one roof-surface model between balanced snow,
drift and sliding. Planes use non-collinear geometric points. Pitch comes
from the gradient, elevations from the plane, and widths and spans from
roof coordinates. A section alone cannot certify a surface over a footprint
and receives an explicit refusal. The fix is included in 0.6.1.

## Workaround

Determine snow loads independently from the applicable CIRSOC 104-2005
provisions and the actual roof surfaces. Apply verified loads explicitly
until upgrading to 0.6.1 or later. A rotation, slope override or
switch of solver is not a validated repair.

## What to do with results you already have

Regenerate the affected snow loads after upgrading to a release containing
the correction. Review balanced, unbalanced and partial cases, drift and
sliding; then re-run every affected analysis, combination, envelope and
derived design check. Reissue calculations and deliverables as required.
Re-solving with previously saved wrong loads alone does not repair them.

## Credits and references

The coordinator assigned this advisory number. Main-source replay and the
retained tests are documented in
[snow-roof-plane.test.ts](../../web/src/lib/engine/loads/__tests__/snow-roof-plane.test.ts)
and the accompanying class tests. See the
[results-change write-up](../results-changes/2026-11-snow-roof-rotation.md).
Code provisions were read from the repository's
[CIRSOC 104-2005 extraction](../codes/CIRSOC/markdown/cirsoc-104-2005/).
