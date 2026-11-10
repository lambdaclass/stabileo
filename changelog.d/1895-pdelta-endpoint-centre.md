### BREAKING (results)

#### Keep endpoint axial point loads consistent in force-based geometric stiffness

Restore the force offset from the integrated length mean plus half the total applied axial load, including point loads at both endpoints, in 2D and 3D frame/truss builders (#1329, PR #1895). Endpoint equivalent nodal forces shift the recovered end average even when the interior force is constant; eight corrected closed-form regressions compare the independent displacement assembly, fail before the fix and pass after it. The aca7eb07a endpoint-centring regression existed only on this unmerged branch, never on main or in a release; see `docs/results-changes/2026-11-pdelta-span-axial.md` and draft SA-2026-055. Complete the advisory summary rows in English, Spanish and Portuguese and date all six status notes 10 November 2026.
