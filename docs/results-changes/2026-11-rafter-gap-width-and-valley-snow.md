# Attached rafter gap width and snow on valley roofs

## Use the shell edges to determine an attached rafter’s gap width

The automatic panel gravity planner uses the width established by the shell edges on both sides of a bounded gap in an attached rafter. Each member interval receives the corresponding part of that same strip. If the shell geometry cannot establish the strip, the planner blocks the load plan. Regenerate affected panel gravity loads.

In the #2295 test model, the shell regions cover 32 m² of horizontal projection and the uncovered interval spans 2 m horizontally. The flanking shell edges establish a 4 m width. At the test's uniform dead pressure of 1 kN/m², the loaded area gives `(32 + 2 × 4)√1.04` kN on the developed roof. The earlier 3 m width gave `(32 + 2 × 3)√1.04` kN. Linear and P-Delta reactions check the total on the original and subdivided rafter.

## Preserve valid snow generation at roof valleys and short seams

A planar roof's elevations within its footprint are bounded by its authored boundary vertex heights. The edge and obstruction checks use these same bounds after reconstructing points in model coordinates. The rotated valley in the regression now generates the expected parapet load because the intervening flat roof blocks the spurious adjacent transfer. The mixed-height obstruction still blocks generation when the transfer cannot be resolved.

A coincident seam must exceed the existing 0.1 m overlap limit to extend drift fetch. The rotated regression retains the 2 m fetch at a 0.099 m overlap and uses the full 22 m fetch at 0.101 m. It checks the generated pressures against the parapet drift equation at the receiving member.
