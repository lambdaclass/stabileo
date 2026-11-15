# Basic 2D plastic collapse released at the certified limit-analysis factor (#758)

## Basic 2D plastic collapse at the certified limit-analysis factor

Results-change entry `basic-plastic-2d-certified-limit` (#758, SA-2026-044).

2D plastic collapse was refused (`PL-2D-INVARIANCE`) because its collapse factor changed with node
numbering, member direction and units, up to 4.6×. The engine's `plastic_limit_2d` now runs the
limit analysis and releases its factor only where the exact plastic certificate's rational static
and kinematic bounds, independent of the linear program, meet at it to 1e-6; `certify_plastic_2d`
is released on the same condition. Axial span loads (Basic's self-weight on columns) go to the end
nodes by their consistent shares, which bend nothing and do the same work in any mechanism of
rigid segments. Anywhere else the result stays withheld with the same message, the two-beam #1475
case and the #758 reproductions included.

The Basic panel reports that factor. Its step-by-step hinge history is a sequence of linear solves
of the structure with the hinges formed so far released, each next hinge where the smallest load
increment brings a section to Mp. Member ends and point loads are sections of their own; inside a
stretch under a span load the critical section is found from the moment function, not on a mesh.
The history forms at most GH + 1 hinges, never two side by side, and ends at the certified factor.

A hinge under a distributed load moves with the peak of the moment. Once it forms, the peak moves
as the load grows, so a hinge held where it formed would leave the moment beside it above Mp. Each
increment therefore puts the hinge where the moment peaks at the increment's end: its section is
brought to Mp by the self-stress of the structure with that section rigid less the structure with
it released, which leaves the moment at every other hinge unchanged, and the increment is solved
with it released there. The section it leaves keeps the plastic rotation it took. A hinge whose
peak runs into the end of its stretch as that section reaches Mp becomes that section's hinge. The
step table, the drawing and the step trace show each hinge where it sat at the step on screen, and
the trace says when it moved.

On the Basic "Portal Frame" (H = 10 kN, q = 15 kN/m): right column head at λ = 53.788, the beam
hinge at x = 2.83 m at λ = 63.810, moving to midspan, right base at 66.450, left column head at
1925/27 = 71.296, the beam mechanism. On "Spring Support": the span hinge of the first span at
x = 1.87 m at λ = 5.427, moving to (√2 − 1)·3 m from the pin, then the section over the spring at
(6 + 4√2)Mp/(qL²) = 12.329. At every step the moment along every member stays within Mp to 1e-6;
before this, it passed Mp by 0.45 % and 0.19 % at the second and third steps of the portal and by
12.8 % at the first step of the spring support.

What moves: Basic 2D plastic collapse gives a collapse factor and hinges again where the
certificate confirms them (`solve.ok`, `collapseFactor`, `hinges`). The plastic analyses are not in
the results corpus, so no snapshot moves for this entry.
