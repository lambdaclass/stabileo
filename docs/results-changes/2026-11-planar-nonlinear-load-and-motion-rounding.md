# Preserve planar nonlinear loads and prescribed motion (2026-11-25)

Issue #2560.

Planar arc-length, displacement-control and co-rotational analyses now combine
coincident member loads before computing their equivalent nodal actions. The
same member actions supply equilibrium, support reactions and member-force
recovery. On the fixed-ended length-2 frame from the issue, the two opposing
axial point loads at three-quarter span have a resultant of 2. Its far-end
force has magnitude 1.5 at full load and 1.125 at a load factor of 0.75.

Arc-length and co-rotational analysis carry member forces through the inclined
support projection in one accumulation before rounding. A small tangent force
can drive motion even beside a large normal force. Member end-force recovery
also resolves the final member orientation directly from the solver-coordinate
displacements, preserving the directions of motion at inclined supports.

Displacement control advances the independent degrees of freedom and rebuilds
the dependent degrees of freedom for each equilibrium check and reported state.
For the 3:1 tie from the issue, the controlled displacement of 0.1 gives the
dependent displacement obtained by multiplying the represented control
coordinate by 3. Isolated two-term ties can use the conditioned pivot that
preserves an exactly representable coefficient.

The planar co-rotational drivers compute prescribed support positions with
one rounding of the affine ramp. In the native warm-start case from the
issue, the accepted position at factor 0.75 is −0.25 and the overall solve
still reports nonconvergence.

Recheck saved planar nonlinear models with member loads, displacement
constraints or prescribed support motion. The changes can affect convergence,
the accepted path, displacements, reactions, constraint forces and member
forces. The research arc worker also validates the full summary before replay.
