### BREAKING (results)

#### Keep endpoint axial point loads consistent in force-based geometric stiffness

Compute the force offset from the integrated length mean and the same function’s interior endpoint average, so an axial point load at either endpoint adds no span term to the end-average matrix in 2D or 3D frame/truss builders (#1329, PR #1895). Eight closed-form regressions fail before the fix and pass after it. This endpoint regression was confined to the unmerged PR correction; see `docs/results-changes/2026-11-pdelta-span-axial.md` and draft SA-2026-055. Complete the advisory summary rows in English, Spanish and Portuguese and date all six status notes 10 November 2026.
