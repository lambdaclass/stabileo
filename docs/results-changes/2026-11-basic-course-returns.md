# Basic: the course units return with their review fixes (#1302–#1307)

Results version 15 withdrew the three changes of [results version 14](2026-11-basic-course.md)
because #871 reached main without the review fixes made to the same code
([the withdrawal](2026-11-basic-course-withdrawn.md)). The course stack #1302–#1307 brings the
course back with those fixes, and each change returns with the pull request that carries it, under
its own results version. The Rust engine is untouched.

## Influence line of the bending moment: sign

From #1304. The influence line of M at a section takes M positive when it puts the bottom fibre in
tension, as every other moment in Basic. Ordinates of moment influence lines change sign; their
magnitudes do not.

## P-Δ and critical load split members at the solve

From #1305. Basic's P-Δ and critical-load analyses solve each member as 4 elements by default (1, 2,
4 or 8 can be chosen), so the geometric stiffness follows the deflected shape along the member and
each piece carries its own axial force. B₂ is 1/(1 − 1/λ₁) from the first buckling factor.
Displacements, forces, B₂ and λcr move toward the converged values; the change is largest for
slender members and members with a load along them.

## Plastic collapse closes unloading hinges

From #1306. The step-by-step collapse stopped as soon as the structure became a mechanism. Under a
distributed load the moment peak drifts along a member, a second hinge forms a sampling step from
the first, and the structure looks like a mechanism that the loads cannot drive: the hinge it would
turn against its moment unloads. The analysis now closes those hinges and goes on; the portal frame
of `web/src/lib/engine/plastic/__tests__/limit.test.ts` gives λc = 71.296 (9625/135) instead of
64.06. A hinge that drifts along a member is listed and drawn once, and a run that does not reach an
admissible mechanism within its step limit stops as "collapse not confirmed" instead of reporting a
collapse load.

The limit analysis of the course searches the position of a distributed-load hinge along every
loaded member. A hinge whose first position fell on a point load was dropped with the section it
coincided with, and the search then refused a valid frame; it now moves off the point load to where
the moment peaks.

Re-check plastic collapse factors of plane frames, above all with distributed loads.
