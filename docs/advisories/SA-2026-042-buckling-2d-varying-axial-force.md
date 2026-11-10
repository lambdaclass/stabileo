# SA-2026-042: 2D buckling overstated the factor of members whose compression grows along them under axial span loads

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-07 (fixed in 0.5.0) |
| Issue | [#1323](https://github.com/lambdaclass/stabileo/issues/1323) |
| Fix | PR [#1324](https://github.com/lambdaclass/stabileo/pull/1324) (merged 2026-11-05), released in v0.5.0 |
| Affected versions | every release with 2D buckling and axial span loads; not bisected |
| Re-check registry | results version entry `buckling-2d-varying-axial-force` |

## Affected features

- **App: 2D buckling analysis** of models with loads along a member's axis: gravity on inclined
  members (rafters, braces), or a point load on a member with a component along it.
- **Engine/WASM: `solve_buckling_2d`** and its certificate (`certify_buckling_2d`).

## What was wrong

Each member's geometric stiffness was built from its mean axial force. Under a load along the
member the axial force varies along it, and where compression grows toward the end that rotates
most the mean understates its destabilising effect: the buckling factor came out too high, with
no warning.

| One member, 4 m, EI = 2·10⁴ kN·m², λP·L²/EI | Exact | Before | After |
|---|---|---|---|
| Cantilever, compression rising from 0 at the support to P at the tip | 3.477 | 4.972 (+43 %) | 3.542 (+1.9 %) |
| Pinned-base sway column, compression largest at the pin | 3.477 | 4.972 (+43 %) | 3.542 (+1.9 %) |
| Cantilever, thrust P at the tip and an opposite axial point load P at mid-span (N = 0 below it, −P above) | 2.961 | 4.972 (+68 %) | 3.056 (+3.2 %) |
| Euler's heavy column (compression largest at the support) | 7.837 | 4.972 (−37 %) | 7.889 (+0.7 %) |

The exact values solve θ'' + λ·c(x)/EI·θ = 0 in closed form (Bessel functions of order −2/3 and
−1/3, and w·tan w = 1) and agree with an independent RK4 shooting solution. The remaining excess
after the fix is the ordinary discretisation error of one cubic member, which a finer mesh
removes (within 0.1 % at 8 members).

## How to tell if your results are affected

You ran 2D buckling on a model where some frame member carries load along its axis. The buckling
factor is a property of the whole model, so recheck it even when another member governs. Models
with no load along any member's axis keep their factors.

## Fixed in

0.5.0.

The geometric stiffness of each member now integrates its whole axial force, ∫N(x)·φ'ᵢ·φ'ⱼ dx,
not its mean. Tests: `engine/tests/buckling_span_axial_2d.rs`.

## Workaround

Split members loaded along their axis into shorter members (four or more) and check that the
buckling factor converges.

## What to do with results you already have

Run the buckling analysis again and reassess every check that used the factor. Where compression
grows toward the end that rotates most the factor drops; where it falls toward that end (a heavy
column on its support) it can rise.
