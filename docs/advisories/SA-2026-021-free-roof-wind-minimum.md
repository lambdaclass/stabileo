# SA-2026-021: free roofs got no wind along their ridge, and less than the §2.1.5 minimum across it

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-28 (fixed in 0.4.0; live on stabileo.com since 2026-10-22) |
| Issue | [#580](https://github.com/lambdaclass/stabileo/issues/580) |
| Fix | PR [#581](https://github.com/lambdaclass/stabileo/pull/581) (merged 2026-10-22); advisory PR [#593](https://github.com/lambdaclass/stabileo/pull/593) |
| Affected versions | 0.2.0 and 0.3.0 |
| Re-check registry | entry `free-roof-wind-minimum` (models with wind) |

## Affected features

PRO › automatic loads › wind, with the structure set to **free roof** (CIRSOC 102-2025 §2.4.3,
`wind-other.ts`): open buildings whose roof stands on columns with no walls (sheds, canopies,
car-park roofs). Closed buildings and the other structures (towers, signs, chimneys) are not
affected: they had their minimum.

## What was wrong

A free roof was loaded only with the net pressures of Figuras 2.4-4 to 2.4-7, which act normal to
the roof surface. CIRSOC 102-2025 §2.1.5 also requires that the design wind force on an open
building be **at least 0,75 kN/m² × Af**, applied horizontally as a load case of its own
(C 2.1.5, C 4.8). That minimum was never applied, with two consequences:

- **With the wind along the ridge, the horizontal force was zero**: the roof's normal pressures
  have no component along the ridge, so nothing loaded the longitudinal bracing, whatever the
  wind speed.
- **With the wind across the ridge**, the horizontal component of the normal pressures fell below
  the minimum at low and moderate basic speeds.

Measured on 0.3.0 (rigid, open, Kzt = 1, tributary width 3 m). Horizontal force of the figures
against 0,75 kN/m² times the roof's own projection only. That is the least Af can be; with columns
and edges counted the shortfall is larger:

| Free roof | Wind | V = 20 m/s | V = 30 m/s | V = 40 m/s | V = 50 m/s |
|---|---|---|---|---|---|
| Pitched, 10 × 6 m, eaves 4 m, ridge 5 m, exp. B | across the ridge | 17 % of the minimum | 38 % | 67 % | 105 % |
| Pitched, same, exp. C | across | 25 % | 56 % | 99 % | 155 % |
| Monoslope, 8 × 6 m, 4 → 6 m, exp. B | across | 36 % | 82 % | 145 % | 227 % |
| Monoslope, same, exp. C | across | 54 % | 121 % | 215 % | 336 % |
| Any of them | **along the ridge** | **0** | **0** | **0** | **0** |

## How to tell if your results are affected

Your model used the automatic wind loads with the free-roof structure. The bracing and the column
bending in the direction of the ridge had no wind; across it, check whether your basic speed is
in the range above.

## Fixed in

#581 (merged and deployed to stabileo.com on 2026-10-22); released in 0.4.0. Each wind direction gets a load case "open-building minimum (§2.1.5)": a horizontal force
0,75 kN/m² × Af at the roof's nodes. Af per axis is the reader's (new fields in the free-roof
options). Without them it is the structure's whole vertical projection, which is never less than
the real Af and can be well above it for an open frame; give Af to use the area of the roof,
columns and bracing alone. A frame modelled in one plane takes its tributary width. The
derivation states which Af was used. Tests: `wind-other.test.ts` ("§2.1.5: the minimum wind force
on an open building, for a free roof").

## Workaround

Add a horizontal load case of 0,75 kN/m² times the projected area normal to each wind direction,
at the roof level, and combine it as wind.

## What to do with results you already have

Re-run free-roof models. Longitudinal bracing, its connections and the columns' weak-axis bending
are the members most likely to change.

## Credits and references

Recorded as an open item of the loads verification (docs/verification/LOADS.md) and fixed by #581.
CIRSOC 102-2025 §2.1.5 and its commentary C 2.1.5 and C 4.8; §2.4.3, Figuras 2.4-4 to 2.4-7.
