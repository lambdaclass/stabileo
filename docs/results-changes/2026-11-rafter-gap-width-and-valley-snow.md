# Attached rafter gap width

## Use the shell edges to determine an attached rafter’s gap width

The automatic panel gravity planner uses the width established by the shell edges on both sides of a bounded gap in an attached rafter. Each member interval receives the corresponding part of that same strip. If the shell geometry cannot establish the strip, the planner blocks the load plan. Regenerate affected panel gravity loads.

In the #2295 test model, the shell regions cover 32 m² of horizontal projection and the uncovered interval spans 2 m horizontally. The flanking shell edges establish a 4 m width. At the test's uniform dead pressure of 1 kN/m², the loaded area gives `(32 + 2 × 4)√1.04` kN on the developed roof. The earlier 3 m width gave `(32 + 2 × 3)√1.04` kN. Linear and P-Delta reactions check the total on the original and subdivided rafter.
