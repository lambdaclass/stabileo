# Spatial envelope cuts and signed force extrema

A cut 0.1 m into a piece starting 1 m from the member end can have a rounded
display coordinate that differs from its physical coordinate. Spatial force
sampling keeps the exact coordinate while selecting the span and face in
each source. The continuous ordinate retains the offset from the rounded
coordinate. On the split and unsplit regression members, the shared cut has
magnitudes 3 kN and 4 kN on its two faces.

Spatial envelope figures and DXF diagrams use the inward faces at the member
ends. An exterior axial ordinate of 10 kN with zero inward force now gives an
inward maximum of zero. Both faces of an interior jump remain available.

Force tables with resultant columns require a concurrent record. With
separate case shear components of 3 kN and 4 kN, their largest case resultant
is 4 kN. A resultant request on the aggregate end record is refused.
Critical summaries recover signed extrema from the solved cases. For axial
cases of 10 kN and 20 kN in tension, the reported minimum is 10 kN. If the
aggregate has lost its source cases, the critical summary is refused.
Piecewise envelope creation binds the inward member ends and source cases
through the same finalizer as prismatic envelope creation.

Recompute affected spatial diagrams and regenerate force tables, figures,
and exports that use envelope results.
