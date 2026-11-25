# Released frame swing mechanisms (2026-11-25)

A member can swing about a released end without changing the position of
the pivot. Its other end translates perpendicular to the chord and rotates
with the member. The motion has zero strain. Earlier decisions inferred
rank from stiffness entries that do not add up exactly in floating point.
Even a zero load residual can coexist with this free motion.

The shared preparation checks this motion against connected elements,
fixed axes, springs, homogeneous constraints and the active coordinates
before consulting numerical rank. The proof requires that the moving
joint is terminal and all its stiffness contributions are accounted for.
The resulting blocking diagnostic identifies the moving joint. The same
structural check also evaluates axial truss witnesses against restraints.

Recheck saved analyses of spatial and planar frames with end releases.
The archived #2119, #2134, #2139, #2190, #2266 and #2380 inputs now have
a structural refusal. Springs and connectors that restrain the swing
remain part of the physical solve.
