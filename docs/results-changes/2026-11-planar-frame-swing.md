# Rigid-body swing of a planar frame group

Planar frame members joined through their unreleased end rotations can
translate and rotate together without strain. An axial member with both of its
ends in the group has zero extension in this motion. The group is a mechanism
when all of its external attachments allow rotation about the same joint.

The elastic stability check identifies this motion from the active frame
connections, support and connector stiffness, and the homogeneous constraint
map. Previously a rounded pivot could support a stiffness rank estimate in one
frame or system of units and fail in another. The elastic solve now reports
the mechanism before factoring the stiffness or solving for a load case.
A support that restrains the swing can restore the load path.

Re-run affected planar elastic, staged and elastic-preload analyses.
