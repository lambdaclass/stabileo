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

The PR #2584 review extends the same entry to support-coordinate rounding,
unresolved constraint rank in material, modal and SSI preparations, and
corotational equilibrium. The support transformation carries the scale of
stiffness terms before cancellation, including terms involving a restrained
normal. Kinematic checks report the same refusal for an unresolved rank.
Corotational equilibrium is checked on the current reduced tangent,
including on native planar continuation. Tangents whose signed stiffness
cannot be resolved can now refuse even when the equilibrium residual is zero.
The checks do not change the assembled stiffness, loads, or residual tolerances.

The material nonlinear solver now requires a resolved physical tangent
before it accepts a zero-residual load increment. For example, a
horizontal truss with an unrestrained transverse tip previously reported
convergence under a load applied at the fixed end, although the transverse
displacement was undetermined. Adding independent transverse stiffness
restores the zero-displacement solution. Harmless released rotations are
still allowed.

The current corotational rank check uses both diagonal and off-diagonal
terms when scaling signed tangents. It checks the physical directions
after excluding verified rotation gauges in the current member frames.
An unresolved physical tangent still blocks convergence.

SSI checks the rank of the current structural and soil secant before
factoring it, including when a restrained load leaves a zero free residual.
A positive pivot within the assembly rounding margin now produces a rank
refusal. Resolved negative corotational stiffness can coexist with a verified
release gauge. The rank check in that case assesses the remaining physical
directions.

Modal analysis reports unresolved constraint rank after validating mass and
before computing modes. Kinematics reports the same diagnosis and marks the
model unsolvable even if the rounded mode count is zero.
