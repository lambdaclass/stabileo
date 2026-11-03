# SA-2026-041: the RC column check paired the largest moment with the largest compression only

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#1316](https://github.com/lambdaclass/stabileo/issues/1316) |
| Fix | #PR |
| Affected versions | every release with the station-based CIRSOC 201 column check; not bisected |
| Re-check registry | `rc-column-least-compression` |

## Affected features

- **App: PRO, Design, CIRSOC 201 verification of RC columns** (the Axial + Moment and Biaxial
  (load contour) rows).

## What was wrong

The column check took the largest moment of any combination and checked it under the largest
compression (and the largest tension, if any) of any combination. Below the balance point a
column's moment capacity falls as its compression falls, so a moment from a lightly compressed
combination (wind, 0.9D) was checked under the gravity compression, where the column is stronger.

| RC design QA frame, 40 × 40 column | Biaxial capacity | Utilization |
|---|---|---|
| Before: My 88.9 (wind), Mz 56.3 (gravity), at N = 257 kN | 144.8 kN·m | 0.727 |
| After: also at the least compression, N = 114 kN | 126.5 kN·m | 0.832 |

The column still passes there, but its margin was overstated by about 15 %.

## How to tell if your results are affected

You used the CIRSOC 201 verification of RC columns whose largest moment comes from a combination
with less compression than the most compressed one (wind or seismic with gravity, 0.9D cases).

## Fixed in

The demands carry the least compression any station of any combination puts on the member, and
the column and biaxial checks run under it as well as under the largest compression and any
tension. The moment capacity at a given compression is concave in that compression, so the two
ends of the range bound every combination in between. Test:
`web/src/lib/engine/__tests__/column-least-compression.test.ts`.

## Workaround

Check each combination's own N and M by hand, or with the design module's per-combination tuples.

## What to do with results you already have

Run the design again and compare the column utilizations, especially columns governed by wind or
seismic combinations.
