# Refuse unresolved reduced stiffness rank (2026-11-25)

In #2266 and #2380, one planar frame is hinged at its fixed support. Its
free end can translate and rotate about the hinge without straining the
member. The applied loads act entirely on the restrained coordinates.
On origin/main at `363131079`, the original frames returned zero
displacements and the stability check reported Stable. Rescaling #2266
or rotating #2380 could instead cause a stiffness factorization refusal.

The stability check now propagates an entrywise rounding margin from the
reduced physical matrix into the basis used to assess stiffness. It
requires a positive factorization with that margin subtracted. The check
runs before a load residual can influence acceptance and uses stiffness
from the supports, springs, connectors and independent constraints
included in the analysis. Accepted solves use the same stiffness and
solution algorithms as before.

Recheck saved results that relied on an unresolved stiffness direction.
Affected models now return a rank diagnostic in the covered analyses.
A frame with an independent restraint, or with sufficient spring or
connector stiffness against the free motion, can still be solved.
