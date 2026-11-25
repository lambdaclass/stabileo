# Prepared member diagrams and planar envelope end forces

In a prepared diagram, the cut positions, forces, polynomial coefficients and
extrema now use the same action snapshot. For the regression fixture, integrating
the original uniform load gives a shear of 2 kN at 1 m and −4 kN at 4 m. Editing
the load can no longer change just the end value to −12 kN. Preparing the
edited record gives 0 kN and −12 kN at those sections.

The 2D envelope force table now reads the right face at I and the left face at
J, using the same section values as the peak calculation. In the report
fixture, a −20 kN jump at J changes the exterior shear from the inward value
of 8 kN to −12 kN. The J cell now reports 8 kN even when the envelope includes
both faces. Both faces remain eligible at interior jumps.

Teaching cut comparisons use the physical section distance from the hand
calculation for the matrix reference. The diagram check for transferring
an extremum to a rounded station still applies to peak queries.
