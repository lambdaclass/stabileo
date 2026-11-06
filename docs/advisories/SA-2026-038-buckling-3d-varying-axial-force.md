# SA-2026-038: 3D buckling overstated the factor of members whose compression grows along them, and refused members compressed only between their ends

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#456](https://github.com/lambdaclass/stabileo/issues/456) |
| Fix | #1309; contained earlier by the BU-SPAN-COMPRESSION warning in #807 |
| Affected versions | every release with 3D buckling and axial span loads; not bisected |
| Re-check registry | results version entry `buckling-3d-varying-axial-force` |

## Affected features

- **App: 3D buckling analysis** of models with distributed loads that have a component along a
  member's axis (gravity on inclined members, rafters, braces).
- **Engine/WASM: `solve_buckling_3d`** and its certificate (`certify_buckling_3d`).

## What was wrong

Each member's geometric stiffness was built from its mean axial force, and the check that some
member is compressed, with the per-member table (axial force, critical force, Keff), read the
average of its two end forces. Under a load along a member the axial force varies along it:

- where compression grows toward the end that rotates most, the mean understates its effect and
  the buckling factor came out too high;
- where the end forces are zero and the member is compressed between them, the analysis was
  refused as having no compressed members.

| One member, 4 m, EI = 2·10⁴ kN·m² | Exact | Before | After |
|---|---|---|---|
| Cantilever, compression rising from 0 at the support to P at the tip, λP·L²/EI | 3.477 | 4.972 (+43 %) | 3.542 (+1.9 %) |
| Sway column, compression largest at a released head, λP·L²/EI | 3.477 | 5.000 (+44 %) | 3.636 (+4.6 %) |
| Euler's heavy column (compression largest at the support), λP·L²/EI | 7.837 | 4.972 (−37 %) | 7.889 (+0.7 %) |
| Cantilever under q = 10 − 5x kN/m (N zero at both ends), λ | 455.69 | refused | 460.08 (+1.0 %) |

The exact values solve θ'' + λ·c(x)/EI·θ = 0 in closed form (Bessel functions of order −2/3 and
−1/3) or by RK4 shooting, which reproduces the closed forms to 1e-12. The remaining excess after
the fix is the ordinary discretisation error of one cubic member, which a finer mesh removes
(within 0.1 % at 8 to 16 members). The factors are the same along a skew axis and in either
principal plane.

## How to tell if your results are affected

You ran 3D buckling on a model where some frame member carries distributed load along its axis.
The buckling factor is a property of the whole model, so recheck it even when another member
governs. Models with no load along any member's axis keep their factors; their per-member table
now reads each member's mean axial force from its elongation.

## Fixed in

The geometric stiffness of each member now integrates its whole axial force, ∫N(x)·φ'ᵢ·φ'ⱼ dx,
in both bending planes and in the Wagner and shear-centre terms, as 2D buckling does since
SA-2026-042. The compression check counts a member with load along its axis; one in tension all
along gives no positive factor and is refused. Tests: `engine/tests/buckling_span_axial_3d.rs`.

## Workaround

Split members loaded along their axis into shorter members (four or more) and check that the
buckling factor converges.

## What to do with results you already have

Run the buckling analysis again and reassess every check that used the factor. Where compression
grows toward the end that rotates most the factor drops; where it falls toward that end (a heavy
column on its support) it can rise.
