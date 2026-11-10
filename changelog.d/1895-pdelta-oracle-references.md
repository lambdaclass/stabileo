### Fixed

#### Assembly oracle counts axial span stiffness once (2026-11-10)

Correct the 2D and 3D affine geometric-stiffness references to include the constant axial span contribution once, and remove its duplicate from the 3D buckling reference (PR #1895, #1329). Independent Simpson integration checks the reused span contribution in both dimensions. Comparisons, assertions, seeds and tolerances are unchanged. This changes test references only; engine results are unchanged.
