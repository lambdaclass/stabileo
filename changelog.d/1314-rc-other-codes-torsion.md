### BREAKING (results)

#### ACI 318 and EN 1992 checks no longer pass a concrete member whose torsion they did not check (2026-11-03)

The other-codes ACI 318 and EN 1992-1-1 checks of reinforced concrete members read flexure, shear and axial force only, so a member carrying large torsion could pass (#1314, SA-2026-040). The check is now marked "torsion not checked" and does not pass: for ACI 318 above the 22.7.1.1 threshold below which torsion may be neglected, φ·0.083·√f'c·Acp²/pcp with √f'c ≤ 8.3 MPa½, and for EN 1992, which has no such threshold, whenever the member carries torsion, and its certificate is refused as partial. Torsion design itself is not added; the CIRSOC 201 design already checks torsion.
