# SA-2026-017: Soil-structure interaction p-y, t-z and q-z curves departed from their references

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#421](https://github.com/lambdaclass/stabileo/issues/421) (AC-12), [#422](https://github.com/lambdaclass/stabileo/issues/422) (AC-13), [#423](https://github.com/lambdaclass/stabileo/issues/423) (AC-16) in the element-derivation review |
| Fix | PR [#526](https://github.com/lambdaclass/stabileo/pull/526) |
| Affected versions | every version with the SSI solver (added 2026-03-08), up to 0.2.0 and `main` until the fix |
| Re-check registry | `soil-curves-references`: models with members, the soil-structure interaction analysis counted as run (it is solved in PRO Advanced from springs a file does not save) |

## Affected features

The nonlinear soil-structure interaction solver (`solve_ssi_2d` / `_3d`, WASM `solveSSI2D` /
`solveSSI3D`) with the built-in soil curves. In the app: **PRO → Advanced → Soil-structure
interaction**, which builds soft-clay, stiff-clay and sand p-y springs. The t-z and q-z curves are
reachable only through the engine and its WASM API. Custom (multilinear) curves, which the member
behaviour panel uses for nonlinear supports, are not affected.

## What was wrong

Three curves did not follow the references their documentation cited, and two did not have the
units the solver assumed:

- **Soft clay (Matlock 1970, API RP 2A §6.8.2):** the ultimate resistance omitted the J·c·z/D term,
  so between the surface and the depth where p_u reaches 9cD it was low (by a third to a half for
  common soft clays). The curve is now API's tabulation of Matlock's static curve, with J an input.
- **Sand (API RP 2A §6.8.6–7):** the loading factor was always A = 0.9, the cyclic value, while the
  documentation said static (API static: A = max(3 − 0.8 z/D, 0.9), up to 3 at the surface); k was
  a step table read at integer degrees (φ = 30.9° used 10.8 MN/m³, φ = 31° jumped to 22 MN/m³).
- **Stiff clay:** labelled Reese's curve, it was neither Reese's nor continuous: 0.5·p_u(y/y50)^¼
  up to y50, then a **jump to p_u**, softening to 0.7·p_u at 16·y50. It is now Welch & Reese (1972)
  stiff clay without free water, which rises to p_u at 16·y50 and stays there.
- **t-z and q-z:** the curves returned a stress (kPa) that the solver multiplied by the tributary
  length only, so a t-z spring was kPa·m (missing the shaft perimeter π·D) and a q-z tip spring was
  kPa·m (missing the tip area, and wrongly scaled by a length). q-z also used √(z/0.1D) instead of
  API's table.

| Case | Quantity | Before | After (reference) |
|---|---|---|---|
| Soft clay c = 20 kPa, γ' = 6 kN/m³, D = 1 m, z = 4 m, J = 0.5 | p_u | 84 kN/m | 124 kN/m |
| Sand φ = 30°, γ' = 10 kN/m³, D = 1 m, z = 2 m, static | A·p_u | 116.8 kN/m | 181.7 kN/m (A = 1.4) |
| same, y = 10 mm | p | 111.2 kN/m | 152.1 kN/m |
| Sand φ = 33° | k | 22 MN/m³ | 17.6 MN/m³ |
| Stiff clay c = 100 kPa, γ' = 9 kN/m³, D = 1 m, z = 3 m, J = 0.5, y just past y50 | p | 327 kN/m (jump) | 238.5 kN/m |
| same, y = 16·y50 | p | 228.9 kN/m | 477 kN/m |
| t-z t_ult = 50 kPa, D = 0.5 m, 1 m of shaft | ultimate force | 50 "kN" | 78.5 kN |
| q-z q_ult = 5000 kPa, D = 0.6 m, tributary length 1 m | ultimate tip force | 5000 "kN" | 1413.7 kN |
| same, z = 0.002·D | Q/Q_p | 0.14 | 0.25 |

Either direction can be unconservative: lower soil resistance gives larger pile deflections and
moments, higher resistance overstates the restraint the soil gives the structure (periods, load
sharing, fixity depth). For t-z the error is a factor π·D: shaft capacity and stiffness were
overstated for piles under 0.32 m in diameter and understated above.

## How to tell if your results are affected

You ran PRO → Advanced → Soil-structure interaction (any soil curve), or called the SSI solver with
a `py_soft_clay`, `py_sand`, `py_stiff_clay`, `tz` or `qz` curve.

## Fixed in

PR #526 (in review); released in 0.3.0. The curves now need the
inputs their references need and refuse a curve without them rather than assume a value: J for the
clays (0.25–0.5), `loading` (static or cyclic) for sand, `free_water: false` for stiff clay (the
submerged stiff-clay curve of Reese, Cox & Koop 1975 is not implemented and is refused), the shaft
`perimeter` for t-z and the `tip_area` for q-z. Sand with φ outside 25°–40° (the range of API's k
table) is refused. The app's SSI panel asks for J and the sand loading. The q-z tip spring is a
force and is no longer multiplied by a tributary length, and it bears only in compression (the node moving in the negative direction of the spring's axis), never in uplift. A spring on a node the model does not have, or along a rotation, is refused (it used to read a zero displacement or load a rotation). Tests: `soil_curves_references.rs` (hand
values from the references at several depths and displacements, laterally loaded piles on each
p-y family, a single pile whose shaft and tip forces match t·π·D·L and q·A), and the demonstrations
`py_soft_clay_ultimate_includes_j_term` and `py_stiff_clay_is_continuous`, no longer ignored.

Documented choices that remain: the soft clay curve is API's piecewise-linear tabulation of
Matlock's cube root (exact at its points), and the stiff clay curve is Welch & Reese's quarter power
sampled at y/y50 = 0.001, 0.003, 0.01, … 3, 8, 16 (at most 3.3 % below it from 0.001 to 16 y50), so
both have a finite initial stiffness the secant iteration can converge on (with the exact power laws
the nodes near zero deflection never settle); t-z keeps its simplified √(z/z_ult) shape (not API's
t-z table).

## Workaround

Model the soil with custom curves computed by hand from the reference, with forces per metre of
pile (p-y, t-z) and a force at the tip (q-z).

## What to do with results you already have

Re-run soil-structure interaction models on the fixed version and re-check pile deflections,
moments and the forces the soil springs carry.

## Credits and references

Found by the element-derivation review (AC-12, AC-13, AC-16, PR #330). Matlock (1970), OTC 1204;
API RP 2A-WSD (2000) §6.4.3, §6.8; API RP 2GEO (2011) §8.5.7 Table 5; Welch & Reese (1972),
Reese & Welch (1975), J. Geotech. Eng. Div. ASCE 101(GT7).
