# Refuse axial joint mechanisms (2026-11-25)

A joint connected to several trusses can translate without strain if its
permitted motion is perpendicular to every attached chord. Parallel trusses
share a strain direction regardless of their individual stiffnesses. Modal
analysis could return a positive-frequency result for such a joint in one
coordinate frame and refuse it in another. Sparse entry filtering can also
hide a coupling that reveals the mechanism.

Elastic preparation now looks for a joint translation that has zero axial
strain and respects the installed supports, spring directions, retained
staged coordinates and homogeneous constraint transform. It checks the
rank of these joint equations in exact arithmetic. A witnessed translation
returns a blocking rank diagnostic with the joint identifier. Saved results
for affected truss models should be rechecked.

The proof covers joints with multiple attached trusses where all
translation restraints contributing to the witness are represented.
The engine still checks conditioning and response accuracy on the numerical
operator. Accepted solves use the existing stiffness and recovery algorithms.
