### BREAKING (results)
#### Count each restrained degree of freedom once (2026-11-25)

The 2D and 3D kinematic checks count each rigidly restrained degree of freedom
once when several supports share a node. This corrects the reported static
degree and can change the structure's classification and diagnosis. Rotation
tests now combine the same restraints before expressing them in the new frame.
