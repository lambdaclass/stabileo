### BREAKING (results)

#### The span check includes a member's shear slope and the thermal curvature at a release (2026-11-06)

`LIN-SMALL-DISPLACEMENT`'s in-span check (#1506) read only the section rotation ψ, so it missed two cases (#1569).
- A shear-flexible (Timoshenko) member whose axis turned past 0.1 rad by shear deformation was not warned. An example is a member rigid in bending with G·As = 77 kN under a 20 kN midspan load: its axis turns 0.13 rad while ψ stays near 1e-7.
- A thermal gradient's free curvature was dropped at a member release, so the rotation at a hinged end read as zero instead of κL/4.

The check now judges the larger of ψ and the axis slope ψ − V/(G·As), on both sides of each point load, and includes each member's thermal curvature α·ΔT/h. Each result records that curvature in `resultSummary.memberSpans[].curvature`. A load combination sums its cases' curvatures with their factors. Numerical values are unchanged; some results gain the warning.
