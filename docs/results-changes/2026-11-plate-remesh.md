# Curved plate boundaries and shell edits during remeshing

Issues [#2460](https://github.com/lambdaclass/stabileo/issues/2460) and [#2461](https://github.com/lambdaclass/stabileo/issues/2461).

A curved plate boundary uses the sweep through its specified intermediate point. Remeshing now uses a curved member’s stations only when they lie on that sweep. Ambiguous stations block remeshing and analysis, with a message naming the plate. A saved mesh made on the complementary sweep is stale and must be replaced before it can be used for analysis.

In the production WASM reproducer, a plate with four fixed corners under 1 kN/m² pressure and self-weight disabled previously gave a total vertical reaction of 14.3431457505 kN. With the sweep specified in the plate definition, the reaction is 26.0743723476 kN. Both values follow from the areas of the respective chordal meshes.

Remeshing carries a shell offset or curvature edit only to a unique replacement cell with exactly the same welded nodes and orientation. It preserves the old corner order so a local offset keeps its reference axes. If any edited shell lacks a match, the existing mesh stays in place and the diagnostic names the plate. Changing the discretization of a curved member also stops if the operation would clear a plate mesh with shell edits.

In the production 4 m square plate reproducer under 1 kN/m² pressure, remeshing previously changed the peak vertical displacement from 5.190070624 µm to 5.883428571 µm by dropping one quad’s offset. Remeshing an exact match now preserves the offset and the original displacement. The remesher cannot recover shell edits already erased from a saved model.

Review affected plates against their intended sweeps and shell properties before using new results.
