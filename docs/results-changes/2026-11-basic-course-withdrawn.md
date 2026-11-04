# Basic: the course units of version 14 are withdrawn (#871)

Results version 15 withdraws the three changes of
[results version 14](2026-11-basic-course.md). #871 reached main without the review fixes made to
the same code in #1070 and the course stack #1302–#1307, so it is reverted; the course returns
with those fixes. The same saved Basic 2D model gives the numbers of version 13 again. The Rust
engine is untouched either way.

## Plastic collapse

The step-by-step plastic collapse of plane models again stops at the first mechanism. Under
distributed loads it can give a lower collapse factor: the portal frame of the version 14 note
gives 64.06 again instead of 71.30. Re-run plastic collapse of plane frames solved with version 14.

## P-Δ and critical load

Basic's P-Δ and critical-load analyses no longer split each member into elements at the solve,
and B₂ is computed as in version 13. Displacements, forces, B₂ and λcr return to their version 13
values. Re-run second-order and buckling analyses of plane models solved with version 14.

## Influence line of the bending moment

The influence line of M at a section takes M with the sign it had in version 13, the opposite of
version 14. Ordinates of moment influence lines change sign again; their magnitudes do not.
