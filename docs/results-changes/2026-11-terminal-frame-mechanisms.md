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

Recheck saved analyses of released frames when a spring or constraint leaves
a terminal swing admissible. The exact compatibility check classifies this
motion after applying the same transform used by the solve. The #2134 Winkler
replay also verifies the shared refusal and its witnessed node. Springs and
connectors that restrain the swing remain part of the physical solve.
