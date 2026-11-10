### BREAKING (results)

#### Force-based geometric stiffness includes axial span work (2026-11-10)

The public 2D and 3D force-based geometric-stiffness builders now include the same axial span integration as P-Delta assembly, end-force recovery and certificates (#1329, PR #1895). The correction is applied before inclined-support rotation and constraint reduction, including both 3D bending planes and member releases. Existing application solvers already use the corrected displacement-based assembly; this follow-up changes the force-based Rust API. See `docs/results-changes/2026-11-pdelta-span-axial.md` and `docs/advisories/SA-2026-055-pdelta-span-axial.md`.
