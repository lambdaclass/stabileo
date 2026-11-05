### Changed
#### The degree of indeterminacy is counted one way everywhere, and plane governing combinations look along the whole member (2026-11-03)

The kinematic panel, the stiffness wizard and the force method now share one count of the degree
of indeterminacy, GH = 3·m + r − 3·n − c, with the internal hinges (c) written out, and split it
into its external and internal parts. In the plane workspace the governing combination of a member
is chosen by the largest moment, shear and axial force anywhere along it, not only at its ends: a
span load whose peak is at midspan now picks the combination that governs there. Re-check governing
combinations of plane members with span loads.
