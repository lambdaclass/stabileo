# Axial members with a free transverse tip

An unattached end of a truss or other axial-only member can move transverse to
the member without extending it. In cases #964, #967, #1008 and #1112, the
assembled stiffness could have a small positive pivot for that motion in one
frame and fail factorization in another.

The solver now checks the physical member and attachment pattern before using
that pivot. It applies the same proof to elastic stiffness, contact and soil
systems, and the axial members in a fiber tangent. The corotational and arc-length
initial checks apply in the unstressed configuration. A prestretched member can
have transverse stiffness from its axial force. Supports, constraints, soil
springs and contact contributions are accounted for before declaring a tip free.

A mechanism produces the existing explicit refusal. The exact stored models
refuse consistently across the equivalent frames and units tested here.
