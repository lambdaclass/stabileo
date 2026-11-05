### BREAKING (results)

#### Linear analysis warns when a rotation passes 0.1 rad (2026-11-05)

Linear analysis assumes small displacements, yet it returned rotations of many radians without notice, for example 75 rad at a nearly free node (#1446). A linear static solve, 2D or 3D, and a load combination now warn with `LIN-SMALL-DISPLACEMENT` when a node rotation, or a frame member's relative end displacement over its length, exceeds 0.1 rad: past it the chord shortening 1 − cos θ is above 0.5 %, larger than elastic strains. Numerical values are unchanged. The 3D torsion beam example twists 0.45 rad and now shows the warning.
