# Static seismic generation requires finite shell corners

PR #2316. 2026-11-19.

The static seismic planner validates the corners of quadrilateral shells and
triangular plates before using them for plan widths or mass. A missing corner
or a non-finite coordinate makes the shell mass indeterminate and blocks
generation before the planner returns seismic weight, base shear or E loads.

In the regression model, a supported frame and a flat shell have a combined
seismic weight and base shear of 8 kN at a manual coefficient of 1. On
`origin/main` at `5319f7214`, changing one shell corner elevation to NaN
silently drops the shell, and the planner reports READY with 4 kN for both
quantities. The corrected planner reports a shell mass refusal. The same
model with finite flat shell geometry still returns 8 kN for both quantities.

Review shell and plate geometry before trusting previously generated E loads.
If the geometry was invalid, repair it, replace the affected generated E
loads, and repeat the analyses, combinations and design checks that use them.
