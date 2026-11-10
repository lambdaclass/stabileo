# Buckling no longer takes geometric stiffness from round-off axial forces

Issue #982, PR #1745.

## Buckling no longer takes geometric stiffness from round-off axial forces

2D and 3D linear buckling assembled the geometric stiffness Kg of every member from its computed
axial force. A member whose real axial force is zero, such as a cantilever loaded across its
axis, carries a round-off force instead, and its Kg then gave a mode with λ ≈ 1e10 next to the
physical ones. That mode was returned in some orientations, units and load scales and not in
others, with a `BU-UNRESOLVED-MODE` warning.

Now:

- A member whose mean axial force is within its round-off bound contributes no Kg. A member's own
  bound is 100 ε times the magnitudes its axial force is recovered from: EA/L times the components
  of its end displacements along it, and its end forces N, V and M/L. Its bound is the largest own
  bound among the members coupled to it through K, because the solve's round-off is set by the
  largest forces in the coupled structure and can land in any member of it: in a cantilever of 16
  members turned 30° under an end moment of 30 kN·m, the computed axial forces are up to 2e-7 kN,
  about 1e7 ε of M/L = 80 kN, while a stiffer member's elongation scale bounds them at 3.5e-6 kN. The
  bound scales with the forces, so the decision does not depend on units; a large force in a part of
  the model not coupled through K does not move it. The absolute 1e-6 kN floors are gone. Every frame, truss and
  cable Kg term is proportional to the axial force, so what is left out is round-off itself.
- An eigenvalue 1/λ below 100 ε of the largest one is dropped as round-off of the eigensolve. That
  can only drop modes with λ above 4.5e13 times the critical factor, never the critical mode.
- Leaving a member out must not hide a mode it could govern: whenever a member is left out, the
  critical factor is solved again with every left-out member at its worst compression within the
  bound, N − noise. If that lowers the critical factor by more than 1 %, the analysis is refused as not
  determinable, naming those members.
- A model whose only compression is within the bound is refused as not determinable, as before
  (pure bending and free thermal strain included, where the axial forces are round-off of the bending
  or of EA·αΔT elsewhere in the structure); a compression below 1e-6 kN that is above its bound is now analysed instead of
  refused, while factors above 1e12 are still not reported.
- The `BU-UNRESOLVED-MODE` warning still names any returned mode that the round-off of the axial
  forces can change by more than 1 % of its geometric work, counting the members left out of Kg in
  the uncertainty, and names those members.

## What moves

| Case | Before | After |
|------|--------|-------|
| #982 frame turned 1° (2D) | λ = 0.168666, 2.18338, 2.766e10 | λ = 0.168666, 2.18338 |
| #982 frame turned 1° in 3D, mm and N | λ = 0.168666, 2.18338, 1.351e10 | λ = 0.168666, 2.18338 |

The two physical factors are the one-element roots (5.2 ∓ √19.84)/0.3 · EI/L² of the compressed
member divided by its axial force (59.56 kN, L = 7.489 m): 0.1686661764 and 2.183378956, which
the engine matches to 1e-10. Through the compression of members left out of Kg the critical factor
can drop by at most 1 % before the analysis is refused, and in the documented cases it moved only by
round-off. The check bounds only that side: a tension left out of Kg, up to N = its bound, takes away
stabilising geometric stiffness and can lower the critical factor by more than 1 %; that change is
conservative. Higher factors are not bounded. Spurious modes
disappear, so a mode count or a higher mode can change, and per-member data now includes members
whose compression is between the round-off bound and the old 1e-6 kN floor. A compression within
the round-off of the structure it is coupled to is left out of Kg; the check at N − bound refuses the
analysis if such a member could lower the critical factor by more than 1 %.
