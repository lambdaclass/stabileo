# Released tip rotations in spatial material analysis

A bending release at an isolated frame tip leaves an unstiffened rotation.
In global coordinates the tangent can assign a small positive or negative
pivot to that direction. In #1090, reversing the member made the material
solver refuse an unloaded cantilever with a prescribed base translation.

The material solver identifies the released axis from the member and its
attachments. It checks load work along the axis before deciding convergence.
The local force law has no component along that axis, including after
yielding. The dense and sparse Newton solves select the representative
orthogonal to the unloaded release. Forces and reactions are recovered from
the physical material law. A moment that does work on the released axis
still produces a refusal.

The #1090 tip now follows the prescribed base translation in both member
orders. Re-run affected spatial material analyses. Reported tip rotations
can change along the released axis on previously solved models.
