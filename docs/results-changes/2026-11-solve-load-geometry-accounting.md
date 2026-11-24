# Refusals for load and plate-geometry discrepancies

Web analysis now compares the force and moment about the model origin for each static load case against the corresponding assembled solver loads. Diagnostics identify the case, component and both values. A restored planar point couple explicitly edited to zero is refused if assembly still carries its legacy moment. Self-weight is outside the comparison.

Physical plates are checked against their declared outline, openings and circular sweeps. The area comparison accounts for the difference between a verified arc and the mesh chords that represent it. A plate meshed on the complementary sweep is refused even if its mesh signature says it is current. Remeshing also refuses to discard an edited shell offset or curvature flag before the existing elements are removed.

Affected analyses can stop where they previously returned results. The solver equations are unchanged. Issues [#2459](https://github.com/lambdaclass/stabileo/issues/2459), [#2460](https://github.com/lambdaclass/stabileo/issues/2460) and [#2461](https://github.com/lambdaclass/stabileo/issues/2461).
