### BREAKING (results)

#### Linear analysis warns when a rotation passes 0.1 rad (2026-11-05)

Linear analysis assumes small displacements, yet it returned rotations of many radians without notice, for example 75 rad at a nearly free node (#1446). A linear static solve, 2D or 3D, now warns with `LIN-SMALL-DISPLACEMENT` when a node rotation (in 3D the rotation vector's norm), or a frame member's relative end displacement over its length, exceeds 0.1 rad. A load combination warns when its own rotations do or a member of one of its cases did: past it the chord shortening 1 − cos θ is above 0.5 %, larger than elastic strains. Numerical values are unchanged. The 3D torsion beam example twists 0.45 rad and now shows the warning.
