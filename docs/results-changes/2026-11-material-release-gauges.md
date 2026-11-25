# Material analysis of released frame ends (2026-11-25)

In #1090 a spatial cantilever has a released tip rotation and moves under a
prescribed support displacement. The released local rotation has zero strain.
In one member orientation the material solver attempted to factor a singular
tangent and refused the model. In the other orientation a rounded pivot
allowed the solve and could select an arbitrary value of the released rotation.

The tangent is now prepared with a reference rotation for a single frame end
whose release and restraints establish that this motion is free. Preparation
checks that the applied load does no work in the rotation. The material solve
uses the same reference at rank certification and at factorization, while
internal forces and convergence are evaluated with the physical tangent.
Dense and sparse corrections share this preparation before projecting through
constraints. Recheck saved material analyses of spatial models with releases.
