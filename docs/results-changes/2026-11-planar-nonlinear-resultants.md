# Preserve load resultants, displacement ties and forward arc steps (2026-11-24)

PR #2539, following issue #2510.

The planar co-rotational, arc-length and displacement-control solvers now
sum the nodal and member contributions from each load pattern before
applying continuation factors. Both equilibrium and reaction recovery use
the same force vector. Member end actions are combined before scaling too.
This preserves small resultants from cancelling loads at intermediate
factors. For example, a unit resultant on the restrained end of an axial
bar contributes 0.75 to the reaction at a load factor of 0.75. Rescaling
the original cancelling records individually could erase that contribution.

Both planar co-rotational drivers reconstruct tied displacements after
updating independent coordinates and assigning prescribed supports. A unit
tie remains equal when the prescribed master changes from 1 to 1e-20,
even though the increment alone rounds to −1.

A spherical arc step must satisfy equilibrium, the requested radius and a
positive projection on the previous accepted direction. A backwards
corrector restores the last accepted state and follows the smaller-radius
retry path. If no retry succeeds, the solver reports the accepted prefix.
A path can still continue past a limit point where the load factor falls
while displacement continues along the branch.
