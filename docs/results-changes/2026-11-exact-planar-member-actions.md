# Accumulate planar nonlinear member actions exactly (2026-11-25)

PR #2567, review of issue #2560.

A fixed-ended length-3 frame carrying axial point forces of +3 × 2^52
at station 1 and −2^52 at station 3 has a zero far-end axial action.
The review parent rounded the unit influence 1/3 before applying the
load magnitude. Its far-end equivalent nodal action was −0.25 at full
load, giving a +0.25 support reaction and member end force.

Planar arc-length, displacement-control and co-rotational analyses form
equivalent nodal actions in rational arithmetic from the represented load
magnitudes, stations and element geometry. The same path covers transverse
and axial point forces, point couples, and full and partial distributed
loads. It integrates the transverse load times the element's shape
functions exactly and condenses member releases before rounding.
Equilibrium and reaction recovery use the accumulated solver-axis
forces, and member-force recovery uses the accumulated local actions.

On the length-3 fixed-ended transverse fixture, a uniform load of
108 × 2^52 from station 0 to 1 gives a far-end shear action of 10 × 2^52
and moment action of −9 × 2^52. The resisting endpoint force and couple
cancel both actions exactly. The main-branch replay before this change
converged with a far-end reaction moment of +8 at full load.

Recheck saved planar nonlinear runs with member loads. The correction can
affect convergence, the accepted path, displacements, reactions,
constraint forces and member forces.
