# SA-2026-007: 3D buckling missed torsional and flexural-torsional buckling (up to 96 % too high)

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#404](https://github.com/lambdaclass/stabileo/issues/404) (related: [#439](https://github.com/lambdaclass/stabileo/issues/439)) |
| Fix | PR [#434](https://github.com/lambdaclass/stabileo/pull/434) (merged via #507, 2026-10-21) |
| Affected versions | every version with 3D buckling, up to 0.2.0 and `main` until the fix |
| Re-check registry | to add with the fix |

## Affected features

3D linear buckling, 3D P-Delta, the buckling and P-Delta certificates, every path that assembles
the frame geometric stiffness (dense, sparse, inclined supports, constraints, warping DOFs).

## What was wrong

The 3D frame geometric stiffness had only the two bending blocks: no Wagner term (P·r0² on the
twist) and no shear-centre coupling. Torsional and flexural-torsional buckling were never found and
the flexural (Euler) load was reported instead. A 200×10 mm cruciform, L = 1.5 m, fork supports:
P_E = 5 860 kN, P_T = GJ/r0² = 2 993 kN; Stabileo reported 5 860 kN, **96 % above the governing
load**. The certificates bound the error of the assembled problem, so they certified the wrong
(flexural-only) problem.

## How to tell if your model is affected

3D buckling or 3D P-Delta results for members with open thin-walled sections of low torsional
stiffness: cruciforms, single and double angles, tees, channels, short thin-walled open sections.
Doubly symmetric I-sections where flexural buckling governs are not affected. Design checks that
compute torsional buckling themselves (CIRSOC 301 E.4, since 0.2.0) are not affected; analysis
buckling factors used for stability (e.g. amplification, effective lengths) are.

## Fixed in

`main` (#434, merged through the batch-4 integration PR #507 and deployed to stabileo.com on
2026-10-21); released in 0.3.0. The workaround below is for checking results
obtained before that date; it must not be applied to new runs.

## Workaround

Do not use the 3D buckling factor for members with the sections above; compute torsional and
flexural-torsional buckling by hand (P_T = (GJ + π²ECw/L²)/r0²; flexural-torsional per AISC E4 /
CIRSOC 301 E.4) and use the lower value.

## What to do with results you already have

Re-check stability conclusions (buckling factors, P-Delta amplification) for structures with
angle, tee, channel or cruciform members.

## Credits and references

Element-derivations review (PR #330, MD-8); McGuire, Gallagher & Ziemian, *Matrix Structural
Analysis*, 2nd ed., ch. 8–9; Trahair, *Flexural-Torsional Buckling of Structures*.
