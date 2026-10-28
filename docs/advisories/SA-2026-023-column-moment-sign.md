# SA-2026-023: the RC column check read one sign of the moment, and an uneven bar layout is weaker the other way

| | |
|---|---|
| Severity | Critical |
| Status | Published 2026-10-28 (fixed in 0.4.0; live on stabileo.com since 2026-10-25) |
| Issue | — (D4-01 in the 2026-10 audit) |
| Fix | PR [#590](https://github.com/lambdaclass/stabileo/pull/590), merged with the integration PR [#629](https://github.com/lambdaclass/stabileo/pull/629) of #589, #590, #588 and #487 (2026-10-25) |
| Affected versions | the verification of provided column bars from 2026-04-19 (5ba936310, by source history; not bisected by running), 0.2.0 and 0.3.0; the column designer's own sizing from 0.3.0 (PR #402, 2026-10-21); `main` until the fix |
| Re-check registry | `column-capacity-both-signs`, results version 3 (models with CIRSOC 201 members) |

## Affected features

The CIRSOC 201 uniaxial check of rectangular RC columns, wherever it gives a verdict:

- the verification of the column bars a member has (`verifyProvidedReinforcement`, uniaxial
  branch: a column whose station demand bends it about one axis);
- the column designer that picks the bars (`checkColumn`) and the engine's re-check of its pass
  (`engineRecheckElement`), which the automatic verification of concrete members runs;
- the engine/WASM function `solve_column_capacity_batch` they all call.

Only layouts that are **not symmetric about the bending axis** are affected: the designer's 6, 10,
14, 18 and 22 bars (the extra face bars go to the bottom and the right face), an older grouped
count that does not split evenly over four faces, and bars entered face by face with a different
count on the two faces the moment loads (nTop ≠ nBottom about the primary axis, nLeft ≠ nRight
about the secondary one). Symmetric layouts (4, 8, 12, 16, 20, 24 bars; equal opposite faces) gave
the right capacity. The biaxial check already took the weakest of the four sign quadrants and is not
affected.

## What was wrong

The station moments reach the column check as magnitudes: the check cannot know which face the
moment compresses. The capacity was computed for one sign only, with the top (or +x) face
compressed. On a layout with more bars on the bottom face that is the stronger sign: the extra bars
are in tension. With the moment reversed the side with fewer bars is in tension and the capacity is
lower, and that sign was never checked. **The column passed on a capacity it has for one direction
of the moment only**: on the designer's 6 to 22 bar layouts (sections 25×25 to 60×60 cm, f'c = 25
MPa, axial force up to 0.7·φPn,max) the capacity read was up to 38 % above the weaker sign's. (For some
layouts and axial forces the sign read was the weaker one; those checks were conservative.)

| 30×30 cm, f'c = 25 MPa, fy = 420 MPa, 6 Ø20 (three bars on the bottom face), Nu = 100 kN | Correct (after the fix) | Before the fix |
|---|---|---|
| φMn at Nu | 78.57 kN·m | 101.57 kN·m |
| Mu = 100 kN·m: demand/capacity and verdict | 1.27, fails | 0.98, passes ("warn") |
| Bars the designer picks for Nu = 100 kN, Mu = 100 kN·m | 12 Ø16 | 6 Ø20 |

The correct value is the section engine's capacity at Nu with the bottom face compressed
(`Section::at_axial` along −y, the same strain-compatible solution the check uses for +y); it is the
capacity of the same layout mirrored, read the old way.

## How to tell if your model is affected

Your model has concrete members checked by CIRSOC 201, and a column whose bars are not symmetric
about the axis it bends about: 6, 10, 14, 18 or 22 bars from the designer, or faces entered with a
different number of bars on opposite faces. Columns checked under biaxial bending, and columns
whose governing check is the axial force, are not affected.

## Fixed in

PR #590, merged through #629 and deployed to stabileo.com on 2026-10-25; released in 0.4.0. The column kernel
(`engine/src/column_capacity_kernel.rs`) solves both signs and returns the weaker, with the sign
that governs (`momentSign` on the column result). A layout symmetric about the bending axis is
solved once, exactly as before (bit for bit). Tests:
`engine/src/column_capacity_kernel.rs` (`either_moment_sign_the_weaker_governs`,
`symmetric_layouts_are_solved_once_exactly_as_before`) and
`web/src/lib/engine/__tests__/column-capacity-moment-sign.test.ts` (the worked case, the designer's
pick, and a property over designer and per-face layouts).

## Workaround

Use a layout symmetric about each bending axis (4, 8, 12, 16, 20 or 24 bars, or equal opposite
faces). For a column already designed with an uneven layout, check it with the bars mirrored
(the face with more bars swapped to the other side): the smaller of the two capacities is the
column's.

## What to do with results you already have

Re-check every column with an uneven layout that passed under uniaxial bending, in particular those
that passed with little margin; re-run the design on the fixed version, which may add bars.

## Credits and references

Found by the 2026-10 audit's RC property suite (D4, property P4: the uniaxial check of a magnitude
demand must hold for both signs of the moment).
