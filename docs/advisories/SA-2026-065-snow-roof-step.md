# SA-2026-065: CIRSOC 104 omitted roof-step drift on pitched receiving roofs

| | |
|---|---|
| Severity | High |
| Status | Drafted 2026-11-14; published 2026-11-15 |
| Publication | 2026-11-15; included in 0.6.1 |
| Issue | [#2082](https://github.com/lambdaclass/stabileo/issues/2082) |
| Fix | PR [#2095](https://github.com/lambdaclass/stabileo/pull/2095); released in 0.6.1 |
| Fixed release | 0.6.1 (2026-11-15) |
| Affected versions | Reproduced on origin/main fb241aa04936a993a3ecd4a2ec4f9490669c1d34, also the v0.6.0 tag; older releases not assessed here |
| Re-check registry | [snow-roof-step](../../web/src/lib/provenance/result-changes/snow-roof-step.json) |

## Affected features

CIRSOC 104-2005 snow loads generated for member roofs, and every analysis,
combination, design check or export consuming those loads. The generator
runs in TypeScript before the native/WASM solver boundary. Changing the
analysis method cannot repair an incorrect generated load. Manually
entered, independently verified snow loads are outside this defect.

## What was wrong

The P700-equivalent model is a 20-degree smooth lower gable roof, with a
flat upper roof 0.45 m above its eave. Ground snow is 1 kN/m². The retained
test uses the same geometry and a width-one probe member 500, 0.1 m from
the step. Main reports no drift: rounded h_b = 0.381 m, h_c = 0.069 m,
p_d = 0. The receiving surface requires h_b = 0.293 m, h_c = 0.157 m,
p_d = 0.412 kN/m² and w = 1.26 m (rounded derivation values).
The generated member-500 downward line load at its start changes from
0.7692307692307692 to 1.148875 kN/m. The inferred peak at the step is
1.1817 kN/m². These are load-generation witnesses, not a claim about a
particular structure's response or utilization.

Main used the level panel's flat-roof snow depth, suppressing drift through
the h_c/h_b exemption. The earlier unmerged correction at 5a7e92d4b9
instead averaged rafter inclinations and projected elevations onto rafters.
That cannot determine a roof plane. The retained skew case has
z = 3 + 0.5y: a diagonal rafter's inclination is 19.47122063449069 degrees,
while the plane pitch is 26.56505117707799 degrees. At (0,6), the plane
elevation is 6 m; the earlier projection returned 4.5 m.
The full plane regression includes non-collinear roof geometry. The exact
T123 single-diagonal probe is underdetermined and now refuses when asked
to supply a plane over a two-dimensional footprint.

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
[results-change write-up](../results-changes/2026-11-snow-roof-step.md).
Code provisions were read from the repository's
[CIRSOC 104-2005 extraction](../codes/CIRSOC/markdown/cirsoc-104-2005/).
