# Buckling no longer takes geometric stiffness from round-off axial forces

Issue #982, PR #1745.

## Buckling no longer takes geometric stiffness from round-off axial forces

2D and 3D linear buckling assembled the geometric stiffness Kg of every member from its computed
axial force. A member whose real axial force is zero, such as a cantilever loaded across its
axis, carries a round-off force instead, and its Kg then gave a mode with λ ≈ 1e10 next to the
physical ones. That mode was returned in some orientations, units and load scales and not in
others, with a `BU-UNRESOLVED-MODE` warning.

Now:

- A member whose mean axial force is within its round-off bound contributes no Kg. The bound is
  100 ε times the round-off scale of the member's elongation (as before), plus its own end forces
  and the largest force in the model; the absolute 1e-6 kN floors are gone, so the decision does
  not depend on units. Every frame, truss and cable Kg term is proportional to the axial force, so
  what is left out is round-off itself.
- An eigenvalue 1/λ below 100 ε of the largest one is dropped as round-off of the eigensolve. That
  can only drop modes with λ above 4.5e13 times the critical factor, never the critical mode.
- A model whose only compression is within the bound is refused as not determinable, as before.
- The `BU-UNRESOLVED-MODE` warning still names any returned mode that the round-off of the axial
  forces can change by more than 1 % of its geometric work.

## What moves

| Case | Before | After |
|------|--------|-------|
| #982 frame turned 1° (2D) | λ = 0.168666, 2.18338, 2.766e10 | λ = 0.168666, 2.18338 |
| #982 frame turned 1° in 3D, mm and N | λ = 0.168666, 2.18338, 1.351e10 | λ = 0.168666, 2.18338 |

The two physical factors are the one-element roots (5.2 ∓ √19.84)/0.3 · EI/L² of the compressed
member divided by its axial force (59.56 kN, L = 7.489 m): 0.1686661764 and 2.183378956, which
the engine matches to 1e-10. Physical factors change only at round-off level. Spurious modes
disappear, so a mode count or a higher mode can change, and per-member data now includes members
whose compression is between the round-off bound and the old 1e-6 kN floor.
