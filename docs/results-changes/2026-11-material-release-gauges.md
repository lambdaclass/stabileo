# Released rotations with independent constraints (2026-11-25)

Spatial material analysis can solve orthogonally to an unloaded rotation at an
isolated released frame end. A translation constraint at that node previously
excluded the axis along with the translation. The tangent could then refuse
the reversed #1090 frame because its free rotation produced a singular pivot.

The same release proof now checks whether each rotational coordinate maps to
an isolated unit column in the effective constraint transform. A constraint
on the translation can leave those columns intact. The rank check and the
correction solve consume the same constrained operator.

Recheck saved spatial material analyses with frame releases and constraints.
