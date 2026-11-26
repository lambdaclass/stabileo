# Elastic mechanisms at unrestrained member tips

A frame member with an unrestrained tip can swing as a rigid body about a
bending release at its attached end. Its tip translates and rotates together
without member strain. In some coordinate frames the assembled stiffness
assigned a small positive stiffness to this motion. Some analyses returned
displacements for the singular model. With the loads applied only at a support,
zero displacement could pass the residual check.

The elastic stability check now identifies this motion from the frame releases
and the active restraints before accepting the stiffness rank. It checks the
homogeneous constraint reduction and the attachments and support springs at the
tip. The same verdict applies in different coordinate frames and units. A
member with an additional load path at its tip proceeds through the existing
stiffness checks.

Re-run affected linear, staged and elastic-preload analyses of models with
member releases. The solver reports the mechanism at the affected node and
withholds the corresponding results.
