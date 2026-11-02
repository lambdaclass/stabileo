# SA-2026-029: 3D design checks read the lateral moment or shear where the strong-axis one acts

| | |
|---|---|
| Severity | Critical (CIRSOC 201 columns in the app); Medium (engine/WASM 3D design bridges, API only) |
| Status | Draft |
| Issue | [#532](https://github.com/lambdaclass/stabileo/issues/532) |
| Fix | PR [#1233](https://github.com/lambdaclass/stabileo/pull/1233) (not yet merged) |
| Affected versions | App column check: the `MuMax = MzMax` column branch of `auto-verify.ts` is in its current form since 2026-06-09 (62dd3798b), not bisected by running. Engine: `extract_rc_demands_3d` and the steel 3D extraction since 2026-03-16 (08475eb73), `certify_steel_multi_case_3d` since 2026-10-15 (64e15063d). `main` until the fix |
| Re-check registry | `cirsoc201-column-design-axes` in web/src/lib/provenance/result-changes.json |

## Affected features

- **App, PRO, CIRSOC 201**: the automatic verification of concrete columns and walls
  (`autoVerifyFromResults`, run by Design → Run design). Beams are not affected.
- **Engine/WASM, API only** (the app does not call them):
  - `certify_steel_multi_case_3d` and `steel_demands_from_combinations_3d`, with every converter
    fed from them (`ec3_demands`, `ec2_demands`, `cirsoc201_demands`, `cirsoc301_demands`,
    `rc_demands`, `timber_demands`, `cfs_demands`);
  - `extract_steel_demands_3d`, `extract_rc_demands_3d` and `extract_steel_demands_2d`.

## What was wrong

A section's strong axis is local y (`Iy = b·h³/12`): the strong-axis moment is `My`, which bends
the section over its depth h, and its shear is `Vz`, along the web. `Mz` bends it over its width b
and its shear is `Vy`.

**App, columns.** The column branch took `Mz` as the column's moment and checked it over depth h,
and sent `My` to the biaxial check over width b. A rectangular column bent mainly about `Mz` was
designed and checked as if it bent over its larger dimension. Slenderness end moments were read
from `Mz` only, and the shear of the other axis was not checked.

| 20×40 cm column, f'c = 25 MPa, fy = 420 MPa, Nu = 400 kN, Mz = 40 kN·m | Correct (after the fix) | Before the fix |
|---|---|---|
| Section depth the moment bends over | 20 cm | 40 cm |
| Bars the designer picks | 12.57 cm² | 8.04 cm² (36 % less) |
| Reported ratio | 0.95 | 0.38 |

On five columns from 20×40 to 30×60 cm under `Mz` only (Nu 300 to 1000 kN), `verifyElement` on
the unturned section gave ratios of 0.29 to 0.44 where the turned section gives 0.72 to 0.95. A
column bent mainly about `My` was checked on the conservative side.

**Engine, 3D.** `certify_steel_multi_case_3d` checked web shear with the lateral shear `Vy`, which
is zero under gravity. A 1 m IPE 300 under 900 kN/m has a web-shear ratio of 1.134 and was
certified OK with a shear enclosure of [0, 7·10⁻¹³]. `extract_rc_demands_3d` used `Mz` as Mu,
which is 0 for a gravity beam (it should be wL²/8). The extraction functions also took the shear at
the station of the largest moment, which is about 0 at midspan of a simple span.

The correct values are the hand closed forms (PL/4, P/2, wL²/8, wL/2, PH) and a 2D solve of the
same beam, which match the 3D strong-axis result (`engine/tests/core/design_axes_3d.rs`).

## How to tell if your model is affected

App: your model has CIRSOC 201 concrete columns or walls whose section is not square, and the
moment about the column's local z (`Mz`) is the larger of the two. Engine: you called one of the
functions above with 3D results.

## Fixed in

PR #1233. Every design check reads 3D forces through one mapping, `AxisDemand`
(`engine/src/postprocess/design_axes.rs`): strong axis = `My` with `Vz`, weak axis = `Mz` with
`Vy`. The AISC check takes the weak-axis shear against `awWeak` (G4/G6) or is not evaluated. The
single-plane converters and `extract_rc_demands_3d` refuse a demand with a weak-axis component
rather than drop it. The app's column check takes the larger moment as primary
(`primaryAxis`, `design/design-axes.ts`) over its own depth, turns the section when `Mz` governs,
and checks the other shear over the turned section.

## Workaround

Re-run the design on the fixed version. Before upgrading, check rectangular columns bent mainly
about `Mz` with the section turned (b and h swapped).

## What to do with results you already have

Re-check the bars of every CIRSOC 201 rectangular column whose larger moment is `Mz`. Results
from the engine functions above with 3D input are unreliable for shear (steel), and for flexure
and shear (RC).

## Credits and references

Reported in #532 (external report; its PR #533 was not used). Verified and fixed by the Stabileo
team; the app column path was found while auditing the web side for #532.
