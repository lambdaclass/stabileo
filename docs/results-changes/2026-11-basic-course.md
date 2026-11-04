# Basic: the course units change some advanced results (#871)

Results version 14 registers the numbers that the same saved Basic 2D model gives differently
after #871. None of them comes from the Rust engine, which the pull request does not touch; they
come from how Basic calls it and reads its results. The results snapshot corpus does not run the
Basic 2D advanced toolbar, so no committed snapshot moves.

## Plastic collapse closes unloading hinges

The step-by-step collapse stopped as soon as the structure became a mechanism. Under a
distributed load the moment peak drifts along a member, a second hinge forms a sampling step
from the first, and the structure looks like a mechanism that the loads cannot drive: the hinge
it would turn against its moment unloads. The analysis now closes those hinges and goes on.

- The portal frame of `web/src/lib/engine/plastic/__tests__/limit.test.ts` (columns Mp 1687.5,
  beam Mp 3125, q = 15 kN/m on 6 m, H = 10 kN) gave λc = 64.06; it now gives 71.296, equal to the
  kinematic minimum 9625/135 and to the static check.
- A hinge that drifts along a member is listed and drawn once, from where it formed to where it
  ended, and the hinge count is the count of distinct open hinges.
- The `spring-support` example closes 42 hinges on its way to λc = 12.3288, the limit-analysis
  value. A run that does not reach an admissible mechanism within its 200 steps stops as
  "collapse not confirmed", with the last λ reached; it is not reported as a collapse load.

Re-check plastic collapse factors of plane frames, above all with distributed loads.

## P-Δ and critical load split members at the solve

Basic's P-Δ and critical-load analyses solve each member as 4 elements by default (1, 2, 4 or 8
can be chosen), so the geometric stiffness follows the deflected shape along the member and each
piece carries its own axial force. B₂ is now 1/(1 − 1/λ₁) from the first buckling factor, shown
next to the actual displacement amplification. Displacements, forces, B₂ and λcr move toward the
converged values; the change is largest for slender members and members with a load along them.

## Influence line of the bending moment: sign

The influence line of M at a section now takes M positive when it puts the bottom fibre in
tension, as every other moment in Basic. Ordinates of moment influence lines change sign; their
magnitudes do not.
